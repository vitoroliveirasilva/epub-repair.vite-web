import { buildEpubFromPdf } from './buildEpub';
import { createInitialConverterState } from './model';
import type { ConverterState, EditableSection, PdfAnalysisResult } from './model';
import { analyzePdf, renderPdfPagePreview } from './pdfEngine';
import { button, downloadBlob, el, formatBytes } from '../ui/dom';
import { renderMobileNavigation } from '../ui/mobileNavigation';
import { buildReviewAudit, exportReviewAudit, reviewFindingKey,
  normalizeSectionSpaces, type ReviewFinding } from './reviewSuggestions';

const THEME_STORAGE_KEY = 'epub-repair-theme';
const MAX_PDF_SIZE = 250 * 1024 * 1024;

export function createConverterApp(root: HTMLElement): void {
  initializeTheme();
  const state = createInitialConverterState();
  const rerender = (): void => render(root, state, rerender);
  rerender();
}

function render(root: HTMLElement, state: ConverterState, rerender: () => void): void {
  root.replaceChildren(
    renderHeader(),
    renderHero(),
    renderWorkflowRail(state),
    el('main', {
      className: 'converter-layout',
      attrs: { id: 'converter-workspace' },
      children: [
        el('div', {
          className: 'converter-main',
          children: [
            renderUploader(state, rerender),
            renderProgress(state, rerender),
            state.result ? renderResult(state) : undefined,
            state.analysis ? renderOverview(state) : !state.file ? renderConverterEmptyState() : undefined,
            state.analysis && !state.busy ? renderSettings(state, rerender) : undefined,
            state.analysis && !state.busy ? renderReviewAssist(state, rerender) : undefined,
            state.analysis && !state.busy ? renderAdvancedReview(state, rerender) : undefined,
          ],
        }),
        renderQualitySidebar(state),
      ],
    }),
    renderHowItWorks(),
    renderFooter(),
  );
}

function renderWorkflowRail(state: ConverterState): HTMLElement {
  const generating = state.busy && /montando|renderizando|compactando|acabamento|validando/iu.test(state.progress);
  const current = state.result
    ? 4
    : generating
      ? 4
      : state.analysis
        ? 3
        : state.file
          ? 2
          : 1;
  const steps = [
    ['Selecionar PDF', 'Escolha o documento'],
    ['Processar', 'Texto, imagens e estrutura'],
    ['Revisar', 'Confira e ajuste'],
    ['Gerar e baixar', 'EPUB validado'],
  ];
  return el('nav', {
    className: 'converter-workflow',
    attrs: { 'aria-label': 'Etapas da conversão' },
    children: [el('ol', { children: steps.map(([title, detail], index) => {
      const number = index + 1;
      const status = number < current || (state.result && number === current)
        ? 'complete'
        : number === current
          ? 'active'
          : 'pending';
      return el('li', {
        className: `converter-workflow-step converter-workflow-${status}`,
        attrs: status === 'active' ? { 'aria-current': 'step' } : {},
        children: [
          el('span', { className: 'converter-workflow-number', text: status === 'complete' ? '✓' : String(number) }),
          el('span', { className: 'converter-workflow-copy', children: [
            el('strong', { text: title ?? '' }),
            el('small', { text: detail ?? '' }),
          ] }),
        ],
      });
    }) })],
  });
}

function renderHeader(): HTMLElement {
  return el('header', {
    className: 'app-header',
    children: [
      el('a', {
        className: 'brand-mark',
        attrs: { href: '/', 'aria-label': 'EPUB Repair, início' },
        children: [renderLogoSymbol(), el('span', { text: 'EPUB Repair' })],
      }),
      el('nav', {
        className: 'header-nav',
        attrs: { 'aria-label': 'Navegação principal' },
        children: [
          el('a', { text: 'Reparar EPUB', attrs: { href: '/' } }),
          el('a', { text: 'Converter PDF', attrs: { href: '/converter', 'aria-current': 'page' } }),
          el('a', { text: 'Como funciona', attrs: { href: '#converter-how' } }),
          el('a', { text: 'Privacidade', attrs: { href: '#converter-privacy' } }),
        ],
      }),
      renderMobileNavigation('converter'),
      el('div', {
        className: 'header-actions',
        children: [renderThemeToggle(), el('a', {
          className: 'btn btn-primary btn-small',
          text: 'Selecionar PDF',
          attrs: { href: '#pdf-upload' },
        })],
      }),
    ],
  });
}

function renderHero(): HTMLElement {
  return el('section', {
    className: 'converter-hero',
    attrs: { id: 'top' },
    children: [
      el('div', {
        className: 'converter-hero-copy',
        children: [
          el('p', { className: 'eyebrow', text: 'Conversão editorial local' }),
          el('h1', { text: 'Transforme PDF em EPUB sem carregar a bagunça junto' }),
          el('p', {
            className: 'hero-copy',
            text: 'Reconstrua parágrafos, capítulos e ordem de leitura, leia textos de páginas digitalizadas, compare o resultado e gere um EPUB validado sem enviar o documento para servidor.',
          }),
          el('div', { className: 'hero-actions', children: [
            el('a', { className: 'btn btn-primary btn-large', text: 'Converter meu PDF', attrs: { href: '#pdf-upload' } }),
            el('a', { className: 'btn btn-ghost btn-large', text: 'Entender o processo', attrs: { href: '#converter-how' } }),
          ] }),
        ],
      }),
      el('aside', {
        className: 'hero-preview converter-hero-preview',
        attrs: { 'aria-label': 'Recursos do conversor PDF para EPUB' },
        children: [
          el('div', { className: 'preview-toolbar', children: [
            el('span'), el('span'), el('span'), el('strong', { text: 'PDF → EPUB' }),
          ] }),
          renderFeature('Diagnóstico por página', 'Texto, digitalização, colunas e imagens'),
          renderFeature('Reconstrução editorial', 'Parágrafos, capítulos, notas e tipografia'),
          renderFeature('Leitura de páginas digitalizadas', 'Reconhece texto em imagens sem enviar o arquivo'),
          renderFeature('Validação final', 'Estrutura EPUB e compatibilidade Kindle'),
        ],
      }),
    ],
  });
}

function renderFeature(title: string, detail: string): HTMLElement {
  return el('div', {
    className: 'converter-feature',
    children: [el('span', { text: '✓' }), el('div', {
      children: [el('strong', { text: title }), el('small', { text: detail })],
    })],
  });
}

function renderUploader(state: ConverterState, rerender: () => void): HTMLElement {
  const input = el('input', {
    className: 'visually-hidden',
    attrs: {
      id: 'pdf-file-input',
      type: 'file',
      accept: '.pdf,application/pdf',
      ...(state.busy ? { disabled: 'disabled' } : {}),
    },
  });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void loadAndAnalyze(file, state, rerender);
  });
  const dropzone = el('label', {
    className: `converter-dropzone ${state.file ? 'converter-dropzone-loaded' : ''} ${state.busy ? 'converter-dropzone-busy' : ''}`,
    attrs: { for: 'pdf-file-input' },
    children: [
      el('div', { className: 'converter-drop-icon', attrs: { 'aria-hidden': 'true' }, text: 'PDF' }),
      el('div', { children: [
        state.file ? el('span', { className: 'converter-file-badge', text: state.busy ? 'Processando agora' : 'PDF carregado' }) : undefined,
        el('strong', { className: 'converter-file-name', text: state.file ? state.file.name : 'Escolha ou arraste um PDF' }),
        el('p', {
          className: 'muted',
          text: state.file
            ? `${formatBytes(state.file.size)} · processado somente neste navegador`
            : 'PDFs de até 250 MB com texto, páginas digitalizadas ou conteúdo misto',
        }),
        el('span', {
          className: `btn ${state.file ? 'btn-ghost' : 'btn-primary'}`,
          text: state.busy ? 'Processando arquivo…' : state.file ? 'Trocar PDF' : 'Selecionar PDF',
        }),
      ] }),
      input,
    ],
  });
  for (const eventName of ['dragenter', 'dragover']) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add('converter-dropzone-active');
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove('converter-dropzone-active');
    });
  }
  dropzone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files[0];
    if (file && !state.busy) void loadAndAnalyze(file, state, rerender);
  });
  return el('section', {
    className: 'panel converter-upload-panel',
    attrs: { id: 'pdf-upload', 'aria-label': 'Selecionar PDF para converter' },
    children: [
      el('div', { className: 'section-heading', children: [
        el('p', { className: 'eyebrow', text: '1. Documento' }),
        el('h2', { text: state.file ? 'Documento selecionado' : 'Carregue o PDF' }),
        el('p', { className: 'muted', text: 'O arquivo permanece no dispositivo durante análise, leitura de imagens, prévia e geração do EPUB.' }),
      ] }),
      dropzone,
    ],
  });
}

function renderSettings(state: ConverterState, rerender: () => void): HTMLElement {
  const title = textInput('Título', state.title, 'Título da obra');
  title.addEventListener('input', () => {
    state.title = title.value;
    state.result = undefined;
  });
  const author = textInput('Autor', state.author, 'Nome do autor');
  author.addEventListener('input', () => {
    state.author = author.value;
    state.result = undefined;
  });
  const publisher = textInput('Editora', state.metadata.publisher, 'Nome da editora');
  publisher.addEventListener('input', () => {
    state.metadata.publisher = publisher.value;
    state.result = undefined;
  });
  const publicationDate = textInput('Ano ou data de publicação', state.metadata.publicationDate, 'Ex.: 2025');
  publicationDate.addEventListener('input', () => {
    state.metadata.publicationDate = publicationDate.value;
    state.result = undefined;
  });
  const isbn = textInput('ISBN', state.metadata.isbn, 'ISBN-10 ou ISBN-13');
  isbn.addEventListener('input', () => {
    state.metadata.isbn = isbn.value;
    state.result = undefined;
  });
  const translator = textInput('Tradutor', state.metadata.translator, 'Nome do tradutor');
  translator.addEventListener('input', () => {
    state.metadata.translator = translator.value;
    state.result = undefined;
  });
  const description = textInput('Descrição', state.metadata.description, 'Descrição editorial opcional');
  description.classList.add('converter-field-wide');
  description.addEventListener('input', () => {
    state.metadata.description = description.value;
    state.result = undefined;
  });
  const profile = selectInput('Perfil do documento', state.options.profile, [
    ['book', 'Livro ou romance'],
    ['academic', 'Acadêmico ou documental'],
    ['visual', 'Visual ou diagramado'],
  ]);
  profile.addEventListener('change', () => {
    state.options.profile = profile.value as ConverterState['options']['profile'];
    state.result = undefined;
    rerender();
  });
  const output = selectInput('Formato do EPUB', state.options.outputLayout, [
    ['auto', 'Automático recomendado'],
    ['reflowable', 'Texto ajustável'],
    ['fixed', 'Layout visual fixo'],
  ]);
  output.addEventListener('change', () => {
    state.options.outputLayout = output.value as ConverterState['options']['outputLayout'];
    state.result = undefined;
    rerender();
  });
  const language = selectInput('Idioma principal', state.options.language, [
    ['pt-BR', 'Português do Brasil'],
    ['en', 'Inglês'],
  ]);
  language.addEventListener('change', () => {
    state.options.language = language.value as ConverterState['options']['language'];
    state.result = undefined;
  });
  const activeAdjustments = [
    state.options.enableOcr,
    state.options.removeRepeatedMargins,
    state.options.removePageNumbers,
    state.options.dehyphenate,
    state.options.normalizeTypography,
  ].filter(Boolean).length;
  const updateOption = (key: keyof ConverterState['options'], value: boolean): void => {
    Reflect.set(state.options, key, value);
    state.result = undefined;
    rerender();
  };
  const options = el('div', {
    className: 'converter-checkbox-grid',
    children: [
      optionCheckbox('Ler texto em páginas digitalizadas', 'Reconhecimento local do texto presente nas imagens', state.options.enableOcr, (value) => updateOption('enableOcr', value)),
      optionCheckbox('Remover cabeçalhos e rodapés repetidos', 'Compara padrões recorrentes entre páginas', state.options.removeRepeatedMargins, (value) => updateOption('removeRepeatedMargins', value)),
      optionCheckbox('Remover números de página', 'Somente quando isolados nas margens', state.options.removePageNumbers, (value) => updateOption('removePageNumbers', value)),
      optionCheckbox('Reconstruir palavras hifenizadas', 'Une quebras artificiais entre linhas', state.options.dehyphenate, (value) => updateOption('dehyphenate', value)),
      optionCheckbox('Normalizar tipografia', 'Ajusta espaços, reticências e pontuação', state.options.normalizeTypography, (value) => updateOption('normalizeTypography', value)),
    ],
  });
  const analyzeButton = button(
    'Reanalisar com estes ajustes',
    'btn btn-secondary',
    () => { if (state.file) void analyzeCurrent(state, rerender); },
  );
  analyzeButton.disabled = !state.file || state.busy;
  const convertButton = button('Gerar meu EPUB', 'btn btn-primary btn-large', () => {
    void convertCurrent(state, rerender);
  });
  convertButton.disabled = !state.analysis || state.busy;
  return el('section', {
    className: 'panel converter-settings',
    children: [
      el('div', { className: 'section-heading', children: [
        el('p', { className: 'eyebrow', text: '3. Revisão e ajustes' }),
        el('h2', { text: 'Confira antes de gerar' }),
        el('p', { className: 'muted', text: 'Os dados abaixo já foram preenchidos quando encontrados. Ajuste somente o que precisar e gere o EPUB.' }),
      ] }),
      el('div', { className: 'converter-form-sections', children: [
        formSection('Dados da obra', 'Identificação principal usada pelos leitores e pelo arquivo EPUB.', [
          title, author, description,
        ]),
        formSection('Publicação', 'Informações editoriais detectadas no PDF e ajustáveis antes da conversão.', [
          publisher, publicationDate, isbn, translator,
        ]),
        formSection('Formato de saída', 'Perfil, layout e idioma que orientam a reconstrução.', [
          profile, output, language,
        ]),
      ] }),
      el('div', { className: 'converter-options-section', children: [
        el('div', { className: 'converter-subheading', children: [
          el('div', { children: [
            el('h3', { text: 'Tratamento automático' }),
            el('p', { className: 'muted', text: 'Ajustes seguros aplicados durante a leitura e reconstrução do PDF.' }),
          ] }),
          el('span', { text: `${activeAdjustments} de 5 ativos` }),
        ] }),
        options,
      ] }),
      el('div', { className: 'converter-actions', children: [
        el('div', { className: 'converter-action-copy', children: [
          el('strong', { text: 'Pronto para converter' }),
          el('small', { text: 'O EPUB será reparado e validado antes do download.' }),
        ] }),
        analyzeButton,
        convertButton,
      ] }),
    ],
  });
}

function renderProgress(state: ConverterState, rerender: () => void): HTMLElement | undefined {
  if (state.result && !state.busy) return undefined;
  if (!state.busy && !state.message && !state.error) return undefined;
  const cancelling = Boolean(state.controller?.signal.aborted);
  const cancel = button(cancelling ? 'Cancelando…' : 'Cancelar', 'btn btn-ghost btn-small', () => {
    state.progress = 'Cancelando operação';
    state.controller?.abort();
    rerender();
  });
  cancel.disabled = !state.busy || cancelling;
  const phaseIndex = progressPhaseIndex(state.progress);
  const fallbackProgress = [12, 32, 58, 78, 94][phaseIndex] ?? 8;
  const progressValue = state.progressValue ?? fallbackProgress;
  if (state.busy) {
    return el('section', {
      className: 'panel converter-processing-card',
      attrs: { role: 'status', 'aria-live': 'polite', 'aria-busy': 'true' },
      children: [
        el('div', { className: 'converter-processing-heading', children: [
          el('span', { className: 'converter-spinner', attrs: { 'aria-hidden': 'true' } }),
          el('div', { children: [
            el('p', { className: 'eyebrow', text: 'Processamento local em andamento' }),
            el('h2', { text: state.progress || 'Preparando documento' }),
            el('p', { className: 'muted', text: progressDetail(state.progress) }),
          ] }),
          cancel,
        ] }),
        el('div', { className: 'converter-progress-track', children: [
          el('span', { attrs: { style: `width: ${Math.max(4, Math.min(100, progressValue))}%` } }),
        ] }),
        el('div', { className: 'converter-progress-meta', children: [
          el('span', { text: state.progressValue !== undefined ? `${state.progressValue}% concluído` : 'Trabalhando nesta etapa' }),
          el('span', { text: 'Nenhum arquivo é enviado para servidor' }),
        ] }),
        el('ol', { className: 'converter-processing-steps', children: [
          'Abrir PDF', 'Ler texto e imagens', 'Reconstruir leitura', 'Montar EPUB', 'Validar resultado',
        ].map((label, index) => el('li', {
          className: index < phaseIndex ? 'complete' : index === phaseIndex ? 'active' : '',
          children: [el('span', { text: index < phaseIndex ? '✓' : String(index + 1) }), el('small', { text: label })],
        })) }),
      ],
    });
  }
  return el('section', {
    className: `panel converter-status ${state.error ? 'converter-status-error' : 'converter-status-success'}`,
    attrs: { role: state.error ? 'alert' : 'status', 'aria-live': 'polite' },
    children: [
      el('span', { className: 'converter-status-icon', text: state.error ? '!' : '✓' }),
      el('div', { children: [
        el('strong', { text: state.error ? 'Não foi possível concluir' : 'Análise concluída' }),
        state.error ? el('p', { text: state.error }) : state.message ? el('p', { className: 'muted', text: state.message }) : undefined,
      ] }),
      state.error && state.file ? button('Tentar novamente', 'btn btn-secondary btn-small', () => {
        void analyzeCurrent(state, rerender);
      }) : undefined,
      button('Dispensar', 'btn btn-ghost btn-small', () => {
        state.message = undefined;
        state.error = undefined;
        rerender();
      }),
    ],
  });
}

function progressPhaseIndex(progress: string): number {
  if (/validando|acabamento|revalid/iu.test(progress)) return 4;
  if (/montando|renderizando|compactando|epub/iu.test(progress)) return 3;
  if (/reconstruindo/iu.test(progress)) return 2;
  if (/analisando|lendo texto|digitalizadas|extraindo/iu.test(progress)) return 1;
  return 0;
}

function progressDetail(progress: string): string {
  const index = progressPhaseIndex(progress);
  return [
    'Abrindo o documento e conferindo se o PDF pode ser processado com segurança.',
    'Lendo textos, imagens, colunas e páginas digitalizadas. Essa etapa pode demorar um pouco em documentos formados por fotos.',
    'Refazendo parágrafos, capítulos e a ordem de leitura do documento.',
    'Criando os arquivos internos, o índice e o pacote final do EPUB.',
    'Aplicando o acabamento automático e verificando a compatibilidade do resultado.',
  ][index] ?? 'Processando o documento localmente.';
}

function renderOverview(state: ConverterState): HTMLElement {
  const analysis = state.analysis!;
  return el('section', {
    className: 'panel converter-overview',
    children: [
      el('div', { className: 'section-heading', children: [
        el('p', { className: 'eyebrow', text: '2. Diagnóstico concluído' }),
        el('h2', { text: 'O PDF foi processado com sucesso' }),
        el('p', { className: 'muted', text: 'Confira o resumo abaixo. Você ainda poderá comparar e editar o conteúdo antes de gerar.' }),
      ] }),
      el('div', { className: 'converter-metrics', children: [
        metric(String(analysis.qualityScore), 'Confiança'),
        metric(String(analysis.pageCount), 'Páginas'),
        metric(String(analysis.sections.length), 'Seções'),
        metric(String(analysis.pages.reduce((total, page) => total + (page.figures?.length ?? 0), 0)), 'Ilustrações'),
        metric(String(analysis.nativeTextPages), 'Com texto'),
        metric(String(analysis.ocrPages), 'Texto recuperado de imagem'),
        metric(String(analysis.visualPages), 'Visuais'),
        metric(String(analysis.blankPages), 'Em branco'),
        metric(analysis.suggestedLayout === 'reflowable' ? 'Ajustável' : 'Visual', 'Recomendação'),
      ] }),
    ],
  });
}

function renderComparison(state: ConverterState, rerender: () => void): HTMLElement {
  const analysis = state.analysis!;
  const page = analysis.pages[state.selectedPage - 1] ?? analysis.pages[0];
  const section = state.sections[state.selectedSection] ?? state.sections[0];
  const pageSelect = selectInput('Página original', String(state.selectedPage),
    analysis.pages.map((item) => [String(item.pageNumber), `Página ${item.pageNumber}`]));
  pageSelect.addEventListener('change', () => {
    state.selectedPage = Number(pageSelect.value);
    void ensurePagePreview(state, rerender);
  });
  const sectionSelect = selectInput('Seção reconstruída', String(state.selectedSection),
    state.sections.map((item, index) => [String(index), item.title || `Seção ${index + 1}`]));
  sectionSelect.addEventListener('change', () => {
    state.selectedSection = Number(sectionSelect.value);
    rerender();
  });
  return el('section', {
    className: 'panel converter-comparison',
    children: [
      el('div', { className: 'section-heading', children: [
        el('p', { className: 'eyebrow', text: 'Revisão visual opcional' }),
        el('h2', { text: 'Compare original e reconstrução' }),
        el('p', { className: 'muted', text: 'A prévia ajuda a identificar perda de ordem, texto mal reconhecido em imagens, capítulos incorretos ou elementos que pedem layout visual.' }),
      ] }),
      el('div', { className: 'converter-preview-selectors', children: [pageSelect, sectionSelect] }),
      el('div', { className: 'converter-preview-grid', children: [
        el('article', { className: 'converter-preview-card', children: [
          el('strong', { text: `PDF · página ${page?.pageNumber ?? 1}` }),
          page?.previewDataUrl
            ? el('img', { attrs: { src: page.previewDataUrl, alt: `Prévia da página ${page.pageNumber} do PDF` } })
            : el('div', { className: 'converter-preview-loading', text: 'Gerando prévia desta página…' }),
        ] }),
        el('article', { className: 'converter-preview-card converter-epub-preview', children: [
          el('strong', { text: `EPUB · ${section?.title ?? 'Conteúdo'}` }),
          renderSafePreview(section?.html ?? '<p>Sem conteúdo reconstruído.</p>', state.analysis),
        ] }),
      ] }),
    ],
  });
}

function renderSectionEditor(state: ConverterState, rerender: () => void): HTMLElement {
  const section = state.sections[state.selectedSection];
  if (!section) return el('section', { className: 'panel', text: 'Nenhuma seção disponível.' });
  const title = textInput('Título da seção', section.title, 'Capítulo ou seção');
  title.addEventListener('input', () => {
    section.title = title.value;
    state.result = undefined;
  });
  const text = el('textarea', {
    attrs: { rows: '18', 'aria-label': 'Texto reconstruído da seção', spellcheck: 'true' },
    text: section.plainText,
  });
  text.addEventListener('input', () => {
    section.plainText = text.value;
    section.html = plainTextToHtml(text.value);
    state.result = undefined;
  });
  const previous = button('Seção anterior', 'btn btn-ghost', () => {
    state.selectedSection = Math.max(0, state.selectedSection - 1);
    rerender();
  });
  previous.disabled = state.selectedSection === 0;
  const next = button('Próxima seção', 'btn btn-ghost', () => {
    state.selectedSection = Math.min(state.sections.length - 1, state.selectedSection + 1);
    rerender();
  });
  next.disabled = state.selectedSection >= state.sections.length - 1;
  const split = button('Dividir seção no cursor', 'btn btn-secondary', () => {
    const cursor = text.selectionStart;
    if (cursor <= 0 || cursor >= text.value.length) return;
    splitSection(state, state.selectedSection, cursor);
    rerender();
  });
  const add = button('Adicionar seção depois', 'btn btn-secondary', () => {
    const nextSection: EditableSection = {
      id: `section-${crypto.randomUUID()}`,
      title: `Nova seção ${state.selectedSection + 2}`,
      plainText: '',
      html: '',
      sourcePages: [...section.sourcePages],
    };
    state.sections.splice(state.selectedSection + 1, 0, nextSection);
    state.selectedSection += 1;
    state.result = undefined;
    rerender();
  });
  const moveUp = button('Mover para cima', 'btn btn-ghost', () => {
    moveSection(state, state.selectedSection, -1);
    rerender();
  });
  moveUp.disabled = state.selectedSection === 0;
  const moveDown = button('Mover para baixo', 'btn btn-ghost', () => {
    moveSection(state, state.selectedSection, 1);
    rerender();
  });
  moveDown.disabled = state.selectedSection >= state.sections.length - 1;
  const merge = button('Unir à seção anterior', 'btn btn-ghost', () => {
    mergeWithPrevious(state, state.selectedSection);
    rerender();
  });
  merge.disabled = state.selectedSection === 0;
  const remove = button('Remover seção vazia', 'btn btn-ghost', () => {
    if (section.plainText.trim()) return;
    state.sections.splice(state.selectedSection, 1);
    state.selectedSection = Math.max(0, state.selectedSection - 1);
    rerender();
  });
  remove.disabled = Boolean(section.plainText.trim()) || state.sections.length <= 1;
  return el('section', {
    className: 'panel converter-editor',
    children: [
      el('div', { className: 'section-heading', children: [
        el('p', { className: 'eyebrow', text: 'Edição avançada opcional' }),
        el('h2', { text: 'Ajuste a estrutura antes de gerar' }),
        el('p', { className: 'muted', text: 'Linhas iniciadas por “# ” viram título principal; “## ” vira subtítulo. Preserve os marcadores [[figura:...]] para manter as ilustrações.' }),
      ] }),
      title,
      el('label', { className: 'converter-field', children: [el('span', { text: 'Conteúdo da seção' }), text] }),
      el('div', {
        className: 'converter-editor-actions',
        children: [previous, next, split, add, moveUp, moveDown, merge, remove],
      }),
    ],
  });
}

function renderAdvancedReview(state: ConverterState, rerender: () => void): HTMLElement {
  const details = el('details', {
    className: 'converter-advanced-review',
    children: [
      el('summary', { children: [
        el('span', { className: 'converter-advanced-icon', text: 'Aa' }),
        el('span', { className: 'converter-advanced-copy', children: [
          el('strong', { text: 'Comparar e editar o conteúdo' }),
          el('small', { text: 'Opcional · use somente para conferir páginas, capítulos ou texto reconstruído' }),
        ] }),
        el('span', { className: 'converter-advanced-action', text: 'Abrir revisão avançada' }),
      ] }),
      el('div', { className: 'converter-advanced-content', children: [
        renderComparison(state, rerender),
        renderSectionEditor(state, rerender),
      ] }),
    ],
  });
  details.open = state.advancedReviewOpen;
  details.addEventListener('toggle', () => {
    if (details.isConnected) state.advancedReviewOpen = details.open;
  });
  return details;
}

function renderReviewAssist(state: ConverterState, rerender: () => void): HTMLElement {
  const audit = state.analysis ? buildReviewAudit(state.analysis, state.sections) : undefined;
  const reviewed = state.reviewedFindingIds ?? new Set<string>();
  const filter = state.reviewPriorityFilter ?? 'all';
  const findings = (audit?.findings ?? []).filter((item) =>
    filter === 'all' || item.priority === filter);
  const highCount = audit?.high ?? 0;
  const mediumCount = audit?.medium ?? 0;
  const reviewedCount = (audit?.findings ?? []).filter((finding) =>
    reviewed.has(reviewFindingKey(finding))).length;
  const priorityNames: Record<ReviewFinding['priority'], string> = {
    high: 'Prioridade alta', medium: 'Revisar', low: 'Conferir se necessário',
  };
  const renderFinding = (finding: ReviewFinding): HTMLElement => {
    const canNavigate = finding.page !== undefined || finding.sectionIndex !== undefined;
    const navigate = button('Conferir no editor', 'btn btn-ghost btn-small', () => {
      if (finding.page !== undefined) state.selectedPage = finding.page;
      if (finding.sectionIndex !== undefined) state.selectedSection = finding.sectionIndex;
      state.advancedReviewOpen = true;
      rerender();
      requestAnimationFrame(() => document.querySelector('.converter-comparison')?.scrollIntoView({
        behavior: 'smooth', block: 'start',
      }));
    });
    navigate.disabled = !canNavigate;
    const normalize = finding.canNormalizeSpaces && finding.sectionIndex !== undefined
      ? button('Normalizar espaços desta seção', 'btn btn-secondary btn-small', () => {
          if (!window.confirm('Normalizar sequências de três ou mais espaços no texto desta seção, preservando o HTML, as imagens e a formatação?')) return;
          const index = finding.sectionIndex!;
          const section = state.sections[index];
          if (!section) return;
          state.sections[index] = normalizeSectionSpaces(section);
          state.result = undefined;
          rerender();
        })
      : undefined;
    const key = reviewFindingKey(finding);
    const isReviewed = reviewed.has(key);
    const toggleReviewed = button(isReviewed ? 'Reabrir revisão' : 'Marcar como conferido',
      'btn btn-ghost btn-small', () => {
        state.reviewedFindingIds ??= new Set();
        if (state.reviewedFindingIds.has(key)) state.reviewedFindingIds.delete(key);
        else state.reviewedFindingIds.add(key);
        rerender();
      });
    const origin = [
      priorityNames[finding.priority],
      ...(finding.page !== undefined ? ['Página ' + finding.page] : []),
      ...(finding.sectionIndex !== undefined ? ['Seção ' + (finding.sectionIndex + 1)] : []),
    ].join(' · ');
    return el('article', { className: 'optional-review-item', children: [
      el('strong', { text: finding.title + (isReviewed ? ' · Conferido' : '') }),
      el('small', { className: 'optional-review-origin', text: origin }),
      el('p', { className: 'muted', text: finding.reason }),
      finding.evidence ? el('p', { className: 'optional-review-evidence',
        text: 'Trecho de referência: ' + finding.evidence }) : undefined,
      el('div', { className: 'optional-review-actions',
        children: [navigate, normalize, toggleReviewed] }),
    ] });
  };
  const additional = findings.slice(6);
  const prioritySelect = el('select', { attrs: { 'aria-label': 'Filtrar alertas da revisão' },
    children: [
      el('option', { attrs: { value: 'all',
        ...(filter === 'all' ? { selected: 'selected' } : {}) }, text: 'Todas as prioridades' }),
      ...(['high', 'medium', 'low'] as const).map((priority) => el('option', {
        text: priorityNames[priority],
        attrs: { value: priority,
          ...(filter === priority ? { selected: 'selected' } : {}) },
      })),
    ],
  });
  prioritySelect.addEventListener('change', () => {
    state.reviewPriorityFilter = prioritySelect.value as typeof filter;
    rerender();
  });
  const exportReport = button('Baixar relatório detalhado (JSON)',
    'btn btn-secondary btn-small', () => {
      if (!state.analysis) return;
      const report = exportReviewAudit(state.analysis, state.sections,
        state.reviewedFindingIds);
      downloadBlob(new Blob([report], { type: 'application/json' }),
        'revisao-assistida-pdf.json');
    });
  const details = el('details', { className: 'converter-advanced-review optional-pdf-review', children: [
    el('summary', { children: [
      el('span', { className: 'converter-advanced-icon', text: 'Aa' }),
      el('span', { className: 'converter-advanced-copy', children: [
        el('strong', { text: 'Revisão assistida de PDF' }),
        el('small', { text: 'Opcional · ' + (audit?.total ?? 0) +
          ' alerta(s); ' + highCount + ' prioritário(s). Nenhuma mudança automática.' }),
      ] }),
      el('span', { className: 'converter-advanced-action', text: 'Ver sugestões' }),
    ] }),
    el('div', { className: 'optional-review-list', children: [
      el('p', { className: 'muted',
        text: 'Alertas heurísticos, não diagnósticos definitivos. Confira primeiro os pontos de maior prioridade. A revisão não altera o PDF original.' }),
      audit?.total
        ? el('p', { className: 'muted', text: highCount + ' prioridade(s) alta(s) · ' +
          mediumCount + ' revisão(ões) recomendada(s) · ' +
          audit.low + ' conferência(s) opcional(is). ' +
          reviewedCount + ' alerta(s) marcado(s) como conferido(s) entre os exibidos.' })
        : el('p', { text: 'Nenhum sinal adicional encontrado nesta verificação.' }),
      audit?.omitted ? el('p', { className: 'muted',
        text: 'Exibindo até ' + audit.displayed + ' dos ' + audit.total +
          ' alertas. Baixe o relatório para consultar todos os achados.',
      }) : undefined,
      el('div', { className: 'optional-review-actions', children: [
        prioritySelect, exportReport,
      ] }),
      ...findings.slice(0, 6).map(renderFinding),
      additional.length ? el('details', { className: 'optional-review-more', children: [
        el('summary', { text: 'Mostrar outros ' + additional.length + ' ponto(s) para conferir' }),
        ...additional.map(renderFinding),
      ] }) : undefined,
    ] }),
  ] });
  details.open = state.assistedReviewOpen;
  details.addEventListener('toggle', () => {
    if (details.isConnected) state.assistedReviewOpen = details.open;
  });
  return details;
}

function renderQualitySidebar(state: ConverterState): HTMLElement {
  const warnings = state.analysis?.warnings ?? [];
  return el('aside', {
    className: 'converter-sidebar',
    children: [
      el('section', { className: 'panel converter-quality-card', children: [
        el('p', { className: 'eyebrow', text: 'Qualidade' }),
        el('h2', { text: state.analysis ? `${state.analysis.qualityScore}/100` : 'Aguardando PDF' }),
        el('p', { className: 'muted', text: state.analysis
          ? 'Confiança da reconstrução, não nota estética nem garantia editorial.'
          : 'O diagnóstico mostrará texto selecionável, páginas digitalizadas, colunas, imagens e pontos para revisão.' }),
        state.analysis ? renderRecommendation(state) : undefined,
      ] }),
      state.analysis ? el('section', { className: 'panel converter-warning-panel', children: [
        el('h3', { text: warnings.length ? 'Pontos para conferir' : 'Nenhuma pendência relevante' }),
        ...warnings.slice(0, 12).map((warning) => el('article', {
          className: `converter-warning converter-warning-${warning.severity}`,
          children: [
            el('strong', { text: warning.title }),
            el('p', { text: warning.detail }),
            warning.pageNumber ? el('small', { text: `Página ${warning.pageNumber}` }) : undefined,
          ],
        })),
      ] }) : undefined,
      el('section', { className: 'panel converter-privacy-card', attrs: { id: 'converter-privacy' }, children: [
        el('p', { className: 'eyebrow', text: 'Privacidade' }),
        el('h3', { text: 'Arquivo sempre local' }),
        el('p', { className: 'muted', text: 'Leitura do PDF e das imagens, reconstrução, compactação e validação executam no navegador. A CSP impede conexões externas.' }),
      ] }),
    ],
  });
}

function renderRecommendation(state: ConverterState): HTMLElement {
  const analysis = state.analysis!;
  const layout = state.options.outputLayout === 'auto'
    ? analysis.suggestedLayout
    : state.options.outputLayout;
  return el('div', {
    className: 'converter-recommendation',
    children: [
      el('strong', { text: layout === 'reflowable' ? 'Texto ajustável recomendado' : 'Layout visual recomendado' }),
      el('small', { text: layout === 'reflowable'
        ? 'Melhor para leitura, fonte redimensionável e Kindle.'
        : 'Preserva páginas complexas, digitalizações e diagramação.' }),
    ],
  });
}

function renderResult(state: ConverterState): HTMLElement {
  const result = state.result!;
  const download = button('Baixar EPUB convertido', 'btn btn-primary btn-large', () => {
    downloadBlob(result.blob, result.fileName);
  });
  const another = button('Converter outro PDF', 'btn btn-ghost', () => {
    document.querySelector<HTMLInputElement>('#pdf-file-input')?.click();
  });
  return el('section', {
    className: 'panel converter-result',
    attrs: { role: 'status', 'aria-live': 'polite' },
    children: [
      el('div', { className: 'converter-result-heading', children: [
        el('div', { children: [
          el('p', { className: 'eyebrow', text: 'Conversão finalizada' }),
          el('h2', { text: 'Seu EPUB está pronto para baixar' }),
          el('p', { className: 'muted', text: 'O arquivo foi gerado, passou pelo reparo automático e foi revalidado com sucesso.' }),
          result.integrity ? el('p', { className: 'muted',
            text: 'Integridade do EPUB conferida: ' +
              result.integrity.sectionsChecked + ' seção(ões) e ' +
              result.integrity.imageReferencesChecked + ' referência(s) de imagem preservadas. ' +
              'Esta verificação compara o conteúdo editado com o arquivo final; não garante equivalência com a diagramação do PDF.' }) : undefined,
        ] }),
      ] }),
      el('div', { className: 'converter-result-file', children: [
        el('span', { text: 'EPUB' }),
        el('div', { children: [
          el('strong', { text: result.fileName }),
          el('small', { text: `${formatBytes(result.bytes.length)} · ${result.layout === 'reflowable' ? 'Texto ajustável' : 'Layout visual'}` }),
        ] }),
      ] }),
      el('div', { className: 'converter-result-scores', children: [
        metric(String(result.validation.stats.structureScore), 'Estrutura'),
        metric(String(result.validation.stats.kindleScore), 'Kindle'),
        metric(String(result.validation.stats.errorCount), 'Erros'),
        metric(String(result.validation.stats.warningCount), 'Avisos'),
      ] }),
      el('div', { className: 'converter-result-actions', children: [download, another] }),
    ],
  });
}

function renderHowItWorks(): HTMLElement {
  return el('section', {
    className: 'converter-how',
    attrs: { id: 'converter-how' },
    children: [
      el('div', { className: 'section-heading', children: [
        el('p', { className: 'eyebrow', text: 'Como funciona' }),
        el('h2', { text: 'Do PDF paginado ao EPUB editorial' }),
      ] }),
      el('div', { className: 'converter-how-grid', children: [
        howCard('1', 'Diagnosticar', 'Classifica texto, digitalização, colunas, imagens e padrões repetidos.'),
        howCard('2', 'Reconstruir', 'Refaz parágrafos, capítulos, notas, ordem de leitura e tipografia.'),
        howCard('3', 'Revisar', 'Compara original e EPUB e permite corrigir títulos, divisões e texto.'),
        howCard('4', 'Validar', 'Gera o pacote EPUB e passa pelo mesmo motor de estrutura e Kindle Safe.'),
      ] }),
      el('article', { className: 'support-card converter-limitations', children: [
        el('p', { className: 'eyebrow', text: 'Limitações honestas' }),
        el('h2', { text: 'Conversão automática não substitui revisão editorial' }),
        el('p', { className: 'muted', text: 'A leitura automática de imagens pode errar nomes e pontuação. Tabelas, fórmulas, documentos com várias colunas e projetos gráficos complexos podem exigir layout fixo. PDFs protegidos por senha ou DRM não são desbloqueados.' }),
      ] }),
    ],
  });
}

function renderConverterEmptyState(): HTMLElement {
  return el('section', { className: 'panel empty-state', children: [
    el('div', { className: 'empty-illustration', attrs: { 'aria-hidden': 'true' }, children: [el('span'), el('span'), el('span')] }),
    el('div', { children: [
      el('p', { className: 'eyebrow', text: 'Prévia e diagnóstico' }),
      el('h2', { text: 'Envie um PDF para começar' }),
      el('p', { className: 'muted', text: 'Depois da análise você poderá comparar as páginas, revisar seções e escolher entre EPUB ajustável ou visual.' }),
    ] }),
  ] });
}

async function loadAndAnalyze(file: File, state: ConverterState, rerender: () => void): Promise<void> {
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    state.error = 'Selecione um arquivo PDF válido.';
    rerender();
    return;
  }
  if (file.size > MAX_PDF_SIZE) {
    state.error = 'O PDF excede o limite de 250 MB.';
    rerender();
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPdfSignature(bytes)) {
    state.error = 'O arquivo não possui uma assinatura PDF válida.';
    rerender();
    return;
  }
  state.file = file;
  state.bytes = bytes;
  state.analysis = undefined;
  state.sections = [];
  state.result = undefined;
  state.title = '';
  state.author = '';
  state.metadata = {
    publisher: '',
    publicationDate: '',
    isbn: '',
    translator: '',
    description: '',
  };
  state.selectedPage = 1;
  state.selectedSection = 0;
  state.advancedReviewOpen = false;
  state.assistedReviewOpen = false;
  state.reviewedFindingIds = new Set();
  state.reviewPriorityFilter = 'all';
  await analyzeCurrent(state, rerender);
}

async function analyzeCurrent(state: ConverterState, rerender: () => void): Promise<void> {
  if (!state.file || !state.bytes) return;
  await runTask(state, rerender, async (signal) => {
    const renderProgress = createProgressRenderer(state, rerender);
    state.progress = 'Abrindo PDF localmente';
    state.progressValue = 0;
    const analysis = await analyzePdf({
      fileName: state.file!.name,
      bytes: state.bytes!,
      options: state.options,
      signal,
      onProgress: (progress) => {
        state.progress = progress.phase;
        state.progressValue = Math.round((progress.completed / Math.max(1, progress.total)) * 100);
        renderProgress();
      },
    });
    state.analysis = analysis;
    state.reviewedFindingIds = new Set();
    state.sections = analysis.sections.map((section) => ({ ...section, sourcePages: [...section.sourcePages] }));
    if (!state.title.trim()) state.title = analysis.title;
    if (!state.author.trim()) state.author = analysis.author;
    for (const key of Object.keys(state.metadata) as Array<keyof typeof state.metadata>) {
      if (!state.metadata[key].trim()) state.metadata[key] = analysis.metadata[key];
    }
    state.selectedPage = 1;
    state.selectedSection = 0;
    state.result = undefined;
    state.message = `Análise concluída: ${analysis.pageCount} página(s), ${analysis.sections.length} seção(ões) e confiança ${analysis.qualityScore}/100.`;
  });
  if (state.analysis && !state.error) {
    requestAnimationFrame(() => document.querySelector('.converter-overview')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
}

async function convertCurrent(state: ConverterState, rerender: () => void): Promise<void> {
  if (!state.analysis || !state.bytes) return;
  await runTask(state, rerender, async (signal) => {
    const renderProgress = createProgressRenderer(state, rerender);
    state.progress = 'Preparando EPUB';
    state.progressValue = undefined;
    const result = await buildEpubFromPdf({
      sourceBytes: state.bytes!,
      analysis: state.analysis!,
      sections: state.sections,
      title: state.title,
      author: state.author,
      metadata: state.metadata,
      options: state.options,
      signal,
      onProgress: (phase, completed, total) => {
        state.progress = phase;
        state.progressValue = completed !== undefined && total
          ? Math.round((completed / total) * 100)
          : undefined;
        renderProgress();
      },
    });
    state.result = result;
    state.message = 'EPUB gerado, revalidado e pronto para baixar.';
  });
  if (state.result && !state.error) {
    requestAnimationFrame(() => document.querySelector('.converter-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
}

async function ensurePagePreview(state: ConverterState, rerender: () => void): Promise<void> {
  const page = state.analysis?.pages[state.selectedPage - 1];
  if (!page || page.previewDataUrl || !state.bytes || state.busy) {
    rerender();
    return;
  }
  rerender();
  const controller = new AbortController();
  try {
    page.previewDataUrl = await renderPdfPagePreview(state.bytes, state.selectedPage, controller.signal);
  } catch {
    state.error = 'Não foi possível gerar a prévia desta página.';
  }
  rerender();
}

async function runTask(
  state: ConverterState,
  rerender: () => void,
  task: (signal: AbortSignal) => Promise<void>,
): Promise<void> {
  if (state.busy) return;
  const controller = new AbortController();
  state.busy = true;
  state.controller = controller;
  state.error = undefined;
  state.message = undefined;
  rerender();
  requestAnimationFrame(() => document.querySelector('.converter-processing-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  try {
    await task(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      state.message = 'Operação cancelada sem publicar resultado parcial.';
    } else {
      state.error = error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
    }
  } finally {
    state.busy = false;
    state.controller = undefined;
    state.progressValue = undefined;
    rerender();
  }
}

function splitSection(state: ConverterState, index: number, cursor: number): void {
  const section = state.sections[index];
  if (!section) return;
  const before = section.plainText.slice(0, cursor).trim();
  const after = section.plainText.slice(cursor).trim();
  if (!before || !after) return;
  section.plainText = before;
  section.html = plainTextToHtml(before);
  const next: EditableSection = {
    id: `section-${crypto.randomUUID()}`,
    title: `Nova seção ${index + 2}`,
    plainText: after,
    html: plainTextToHtml(after),
    sourcePages: [...section.sourcePages],
  };
  state.sections.splice(index + 1, 0, next);
  state.selectedSection = index + 1;
  state.result = undefined;
}

function moveSection(state: ConverterState, index: number, direction: -1 | 1): void {
  const target = index + direction;
  if (target < 0 || target >= state.sections.length) return;
  const current = state.sections[index];
  const other = state.sections[target];
  if (!current || !other) return;
  state.sections[index] = other;
  state.sections[target] = current;
  state.selectedSection = target;
  state.result = undefined;
}

function mergeWithPrevious(state: ConverterState, index: number): void {
  if (index <= 0) return;
  const previous = state.sections[index - 1];
  const current = state.sections[index];
  if (!previous || !current) return;
  previous.plainText = [previous.plainText.trim(), current.plainText.trim()].filter(Boolean).join('\n\n');
  previous.html = plainTextToHtml(previous.plainText);
  previous.sourcePages = [...new Set([...previous.sourcePages, ...current.sourcePages])].sort((a, b) => a - b);
  state.sections.splice(index, 1);
  state.selectedSection = index - 1;
  state.result = undefined;
}

function createProgressRenderer(state: ConverterState, rerender: () => void): () => void {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const card = document.querySelector<HTMLElement>('.converter-processing-card');
      if (!card || !state.busy) {
        rerender();
        return;
      }
      const phaseIndex = progressPhaseIndex(state.progress);
      const fallbackProgress = [12, 32, 58, 78, 94][phaseIndex] ?? 8;
      const percentage = state.progressValue ?? fallbackProgress;
      const heading = card.querySelector<HTMLElement>('.converter-processing-heading h2');
      const description = card.querySelector<HTMLElement>('.converter-processing-heading .muted');
      const bar = card.querySelector<HTMLElement>('.converter-progress-track > span');
      const counter = card.querySelector<HTMLElement>('.converter-progress-meta > span:first-child');
      if (heading) heading.textContent = state.progress || 'Preparando documento';
      if (description) description.textContent = progressDetail(state.progress);
      if (bar) bar.style.width = `${Math.max(4, Math.min(100, percentage))}%`;
      if (counter) counter.textContent = state.progressValue !== undefined
        ? `${state.progressValue}% concluído`
        : 'Trabalhando nesta etapa';
      for (const [index, step] of Array.from(
        card.querySelectorAll<HTMLElement>('.converter-processing-steps > li'),
      ).entries()) {
        step.className = index < phaseIndex ? 'complete' : index === phaseIndex ? 'active' : '';
        const number = step.querySelector<HTMLElement>(':scope > span');
        if (number) number.textContent = index < phaseIndex ? '✓' : String(index + 1);
      }
    });
  };
}

function isPdfSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
}

function plainTextToHtml(value: string): string {
  return value.split(/\n{2,}/u).map((block) => {
    const normalized = block.replace(/\s*\n\s*/gu, ' ').trim();
    if (!normalized) return '';
    const image = normalized.match(/^\[\[figura:(figure-\d{4}-\d{2})\]\]$/u);
    if (image) return `<figure class="pdf-inline-figure"><img src="../Images/${image[1]}.jpg" alt="Ilustração do documento original"/></figure>`;
    if (normalized.startsWith('# ')) return `<h1>${escapeXml(normalized.slice(2).trim())}</h1>`;
    if (normalized.startsWith('## ')) return `<h2>${escapeXml(normalized.slice(3).trim())}</h2>`;
    return `<p>${escapeXml(normalized)}</p>`;
  }).filter(Boolean).join('\n');
}

function renderSafePreview(html: string, analysis?: PdfAnalysisResult): HTMLElement {
  const wrapper = el('div', { className: 'converter-preview-content' });
  const parsed = new DOMParser().parseFromString(`<main>${html}</main>`, 'text/html');
  const main = parsed.querySelector('main');
  for (const node of Array.from(main?.children ?? [])) {
    if (node.tagName === 'FIGURE') {
      const source = node.querySelector('img')?.getAttribute('src') ?? '';
      const id = source.match(/(figure-\d{4}-\d{2})\.jpg$/u)?.[1];
      const figure = id && analysis?.pages.flatMap((page) => page.figures ?? [])
        .find((candidate) => candidate.id === id);
      if (figure) {
        wrapper.append(el('figure', { className: 'pdf-inline-figure', children: [
          el('img', { attrs: { src: figure.dataUrl, alt: 'Ilustração preservada do PDF' } }),
        ] }));
      } else {
        wrapper.append(el('p', { text: 'Ilustração preservada no EPUB' }));
      }
      continue;
    }
    if (!['H1', 'H2', 'P', 'ASIDE'].includes(node.tagName)) continue;
    const tag = node.tagName === 'H1' ? 'h1' : node.tagName === 'H2' ? 'h2' : 'p';
    wrapper.append(el(tag, { text: node.textContent ?? '' }));
  }
  return wrapper;
}

function textInput(label: string, value: string, placeholder: string): HTMLLabelElement & { value: string } {
  const input = el('input', { attrs: { type: 'text', value, placeholder } });
  const labelNode = el('label', { className: 'converter-field', children: [
    el('span', { text: label }),
    input,
  ] });
  Object.defineProperty(labelNode, 'value', {
    get: () => input.value,
    set: (next: string) => { input.value = next; },
  });
  return labelNode as HTMLLabelElement & { value: string };
}

function formSection(title: string, detail: string, fields: HTMLElement[]): HTMLElement {
  return el('section', { className: 'converter-form-section', children: [
    el('div', { className: 'converter-form-section-heading', children: [
      el('h3', { text: title }),
      el('p', { className: 'muted', text: detail }),
    ] }),
    el('div', { className: 'converter-form-grid', children: fields }),
  ] });
}

function selectInput(label: string, value: string, options: string[][]): HTMLLabelElement & { value: string } {
  const select = el('select', { attrs: { 'aria-label': label } });
  for (const option of options) {
    select.append(el('option', {
      text: option[1] ?? option[0] ?? '',
      attrs: { value: option[0] ?? '', ...(option[0] === value ? { selected: 'selected' } : {}) },
    }));
  }
  const labelNode = el('label', { className: 'converter-field', children: [el('span', { text: label }), select] });
  Object.defineProperty(labelNode, 'value', {
    get: () => select.value,
    set: (next: string) => { select.value = next; },
  });
  return labelNode as HTMLLabelElement & { value: string };
}

function optionCheckbox(
  title: string,
  detail: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const input = el('input', {
    attrs: { type: 'checkbox', ...(checked ? { checked: 'checked' } : {}) },
  });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { className: 'converter-option', children: [
    input,
    el('span', { children: [el('strong', { text: title }), el('small', { text: detail })] }),
  ] });
}

function metric(value: string, label: string): HTMLElement {
  return el('div', { className: 'converter-metric', children: [
    el('strong', { text: value }), el('small', { text: label }),
  ] });
}

function howCard(number: string, title: string, detail: string): HTMLElement {
  return el('article', { className: 'converter-how-card', children: [
    el('span', { text: number }), el('h3', { text: title }), el('p', { className: 'muted', text: detail }),
  ] });
}

function renderFooter(): HTMLElement {
  return el('footer', { className: 'footer app-footer', children: [
    el('div', { className: 'footer-main', children: [
      el('a', { className: 'footer-brand', attrs: { href: '/' }, children: [renderLogoSymbol(), el('span', { text: 'EPUB Repair' })] }),
      el('nav', { className: 'footer-links', attrs: { 'aria-label': 'Links de navegação e projeto' }, children: [
        el('a', { text: 'Desenvolvedor', attrs: { href: 'https://github.com/vitoroliveirasilva', target: '_blank', rel: 'noreferrer noopener' } }),
        el('a', { text: 'Projeto no GitHub', attrs: { href: 'https://github.com/vitoroliveirasilva/epub-repair.vite-web', target: '_blank', rel: 'noreferrer noopener' } }),
        el('a', { text: 'Reparar EPUB', attrs: { href: '/' } }),
        el('a', { text: 'Converter PDF', attrs: { href: '/converter' } }),
      ] }),
    ] }),
    el('div', { className: 'footer-bottom', children: [
      el('span', { text: `© ${new Date().getFullYear()} Vitor Oliveira Silva` }),
      el('span', { text: 'Conversão e reparo local de documentos de leitura.' }),
    ] }),
  ] });
}

function renderLogoSymbol(): HTMLElement {
  return el('span', { className: 'logo-symbol', attrs: { 'aria-hidden': 'true' }, children: [
    el('span', { className: 'logo-fold' }),
    el('span', { className: 'logo-line logo-line-1' }),
    el('span', { className: 'logo-line logo-line-2' }),
    el('span', { className: 'logo-check' }),
  ] });
}

function renderThemeToggle(): HTMLElement {
  const toggle = el('button', { className: 'theme-toggle', attrs: { type: 'button', 'aria-label': 'Alternar tema claro e escuro' }, children: [
    el('span', { attrs: { 'aria-hidden': 'true' } }),
    el('strong', { text: currentTheme() === 'dark' ? 'Escuro' : 'Claro' }),
  ] });
  toggle.addEventListener('click', () => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    const label = toggle.querySelector('strong');
    if (label) label.textContent = currentTheme() === 'dark' ? 'Escuro' : 'Claro';
  });
  return toggle;
}

function initializeTheme(): void {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') applyTheme(stored, false);
  else applyTheme(matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', false);
}

function currentTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme: 'light' | 'dark', persist = true): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#111817' : '#F7F3EA');
  if (persist) localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function escapeXml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;');
}
