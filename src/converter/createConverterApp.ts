import { buildEpubFromPdf } from './buildEpub';
import { createInitialConverterState } from './model';
import type { ConverterState, EditableSection } from './model';
import { analyzePdf, renderPdfPagePreview } from './pdfEngine';
import { button, downloadBlob, el, formatBytes } from '../ui/dom';

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
    el('main', {
      className: 'converter-layout',
      attrs: { id: 'converter-workspace' },
      children: [
        el('div', {
          className: 'converter-main',
          children: [
            renderUploader(state, rerender),
            renderSettings(state, rerender),
            renderProgress(state, rerender),
            state.analysis ? renderOverview(state) : renderConverterEmptyState(),
            state.analysis ? renderComparison(state, rerender) : undefined,
            state.analysis ? renderSectionEditor(state, rerender) : undefined,
            state.result ? renderResult(state) : undefined,
          ],
        }),
        renderQualitySidebar(state),
      ],
    }),
    renderHowItWorks(),
    renderFooter(),
  );
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
            text: 'Reconstrua parágrafos, capítulos e ordem de leitura, use OCR quando necessário, compare o resultado e gere um EPUB validado sem enviar o documento para servidor.',
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
          renderFeature('OCR local', 'Português e inglês sem enviar o arquivo'),
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
    className: 'converter-dropzone',
    attrs: { for: 'pdf-file-input' },
    children: [
      el('div', { className: 'converter-drop-icon', attrs: { 'aria-hidden': 'true' }, text: 'PDF' }),
      el('div', { children: [
        el('strong', { text: state.file ? state.file.name : 'Escolha ou arraste um PDF' }),
        el('p', {
          className: 'muted',
          text: state.file
            ? `${formatBytes(state.file.size)} · processado somente neste navegador`
            : 'PDFs de até 250 MB com texto, páginas digitalizadas ou conteúdo misto',
        }),
        el('span', { className: 'btn btn-primary', text: state.file ? 'Escolher outro PDF' : 'Selecionar PDF' }),
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
        el('h2', { text: 'Carregue o PDF' }),
        el('p', { className: 'muted', text: 'O arquivo permanece no dispositivo durante análise, OCR, prévia e geração do EPUB.' }),
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
      optionCheckbox('Usar OCR quando faltar texto', 'Reconhecimento local em português e inglês', state.options.enableOcr, (value) => updateOption('enableOcr', value)),
      optionCheckbox('Remover cabeçalhos e rodapés repetidos', 'Compara padrões recorrentes entre páginas', state.options.removeRepeatedMargins, (value) => updateOption('removeRepeatedMargins', value)),
      optionCheckbox('Remover números de página', 'Somente quando isolados nas margens', state.options.removePageNumbers, (value) => updateOption('removePageNumbers', value)),
      optionCheckbox('Reconstruir palavras hifenizadas', 'Une quebras artificiais entre linhas', state.options.dehyphenate, (value) => updateOption('dehyphenate', value)),
      optionCheckbox('Normalizar tipografia', 'Ajusta espaços, reticências e pontuação', state.options.normalizeTypography, (value) => updateOption('normalizeTypography', value)),
    ],
  });
  const analyzeButton = button(
    state.analysis ? 'Analisar novamente com estas opções' : 'Analisar PDF',
    'btn btn-secondary',
    () => { if (state.file) void analyzeCurrent(state, rerender); },
  );
  analyzeButton.disabled = !state.file || state.busy;
  const convertButton = button('Gerar EPUB validado', 'btn btn-primary', () => {
    void convertCurrent(state, rerender);
  });
  convertButton.disabled = !state.analysis || state.busy;
  return el('section', {
    className: 'panel converter-settings',
    children: [
      el('div', { className: 'section-heading', children: [
        el('p', { className: 'eyebrow', text: '2. Preparação editorial' }),
        el('h2', { text: 'Defina como reconstruir o livro' }),
        el('p', { className: 'muted', text: 'O modo automático escolhe texto ajustável quando a estrutura é confiável e layout fixo quando preservar a página é mais seguro.' }),
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
      el('div', { className: 'converter-actions', children: [analyzeButton, convertButton] }),
    ],
  });
}

function renderProgress(state: ConverterState, rerender: () => void): HTMLElement | undefined {
  if (!state.busy && !state.message && !state.error) return undefined;
  const cancel = button('Cancelar', 'btn btn-ghost btn-small', () => state.controller?.abort());
  cancel.disabled = !state.busy;
  return el('section', {
    className: `panel converter-status ${state.error ? 'converter-status-error' : ''}`,
    attrs: { role: state.error ? 'alert' : 'status', 'aria-live': 'polite' },
    children: [
      el('div', { children: [
        el('strong', { text: state.error ? 'Não foi possível concluir' : state.busy ? state.progress : 'Concluído' }),
        state.progressValue !== undefined
          ? el('progress', { attrs: { max: '100', value: String(state.progressValue) } })
          : undefined,
        state.error ? el('p', { text: state.error }) : state.message ? el('p', { className: 'muted', text: state.message }) : undefined,
      ] }),
      state.busy ? cancel : button('Dispensar', 'btn btn-ghost btn-small', () => {
        state.message = undefined;
        state.error = undefined;
        rerender();
      }),
    ],
  });
}

function renderOverview(state: ConverterState): HTMLElement {
  const analysis = state.analysis!;
  return el('section', {
    className: 'panel converter-overview',
    children: [
      el('div', { className: 'section-heading', children: [
        el('p', { className: 'eyebrow', text: 'Diagnóstico' }),
        el('h2', { text: 'Estrutura encontrada no PDF' }),
      ] }),
      el('div', { className: 'converter-metrics', children: [
        metric(String(analysis.qualityScore), 'Confiança'),
        metric(String(analysis.pageCount), 'Páginas'),
        metric(String(analysis.sections.length), 'Seções'),
        metric(String(analysis.nativeTextPages), 'Com texto'),
        metric(String(analysis.ocrPages), 'Com OCR'),
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
        el('p', { className: 'eyebrow', text: '3. Conferência' }),
        el('h2', { text: 'Compare original e reconstrução' }),
        el('p', { className: 'muted', text: 'A prévia ajuda a identificar perda de ordem, OCR ruim, capítulos incorretos ou elementos que pedem layout visual.' }),
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
          renderSafePreview(section?.html ?? '<p>Sem conteúdo reconstruído.</p>'),
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
        el('p', { className: 'eyebrow', text: '4. Revisão editorial' }),
        el('h2', { text: 'Ajuste a estrutura antes de gerar' }),
        el('p', { className: 'muted', text: 'Linhas iniciadas por “# ” viram título principal; “## ” vira subtítulo. Blocos separados por linha vazia viram parágrafos.' }),
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
          : 'O diagnóstico mostrará texto nativo, OCR, colunas, imagens e pontos para revisão.' }),
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
        el('p', { className: 'muted', text: 'PDF.js, OCR, reconstrução, compactação e validação executam no navegador. A CSP impede conexões externas.' }),
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
  return el('section', {
    className: 'panel converter-result',
    children: [
      el('div', { children: [
        el('p', { className: 'eyebrow', text: 'EPUB pronto' }),
        el('h2', { text: 'Conversão concluída e validada' }),
        el('p', { className: 'muted', text: `${result.fileName} · ${formatBytes(result.bytes.length)} · ${result.layout === 'reflowable' ? 'texto ajustável' : 'layout visual'}` }),
      ] }),
      el('div', { className: 'converter-result-scores', children: [
        metric(String(result.validation.stats.structureScore), 'Estrutura'),
        metric(String(result.validation.stats.kindleScore), 'Kindle'),
        metric(String(result.validation.stats.errorCount), 'Erros'),
        metric(String(result.validation.stats.warningCount), 'Avisos'),
      ] }),
      download,
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
        el('p', { className: 'muted', text: 'OCR pode errar nomes e pontuação. Tabelas, fórmulas, documentos com várias colunas e projetos gráficos complexos podem exigir layout fixo. PDFs protegidos por senha ou DRM não são desbloqueados.' }),
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
  await analyzeCurrent(state, rerender);
}

async function analyzeCurrent(state: ConverterState, rerender: () => void): Promise<void> {
  if (!state.file || !state.bytes) return;
  await runTask(state, rerender, async (signal) => {
    const renderProgress = createProgressRenderer(rerender);
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
}

async function convertCurrent(state: ConverterState, rerender: () => void): Promise<void> {
  if (!state.analysis || !state.bytes) return;
  await runTask(state, rerender, async (signal) => {
    const renderProgress = createProgressRenderer(rerender);
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

function createProgressRenderer(rerender: () => void): () => void {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      rerender();
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
    if (normalized.startsWith('# ')) return `<h1>${escapeXml(normalized.slice(2).trim())}</h1>`;
    if (normalized.startsWith('## ')) return `<h2>${escapeXml(normalized.slice(3).trim())}</h2>`;
    return `<p>${escapeXml(normalized)}</p>`;
  }).filter(Boolean).join('\n');
}

function renderSafePreview(html: string): HTMLElement {
  const wrapper = el('div', { className: 'converter-preview-content' });
  const parsed = new DOMParser().parseFromString(`<main>${html}</main>`, 'text/html');
  const main = parsed.querySelector('main');
  for (const node of Array.from(main?.children ?? [])) {
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
      el('nav', { className: 'footer-links', children: [
        el('a', { text: 'Reparar EPUB', attrs: { href: '/' } }),
        el('a', { text: 'Projeto no GitHub', attrs: { href: 'https://github.com/vitoroliveirasilva/epub-repair.vite-web', target: '_blank', rel: 'noreferrer noopener' } }),
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
