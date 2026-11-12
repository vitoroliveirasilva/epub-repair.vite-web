import type { AppState, ProcessingProgress } from '../app/state';
import type { ValidationReport } from '../epub';
import { MAX_FILE_SIZE_BYTES } from '../epub/utils/constants';
import { processEpubBatch } from '../epub/tools/batchProcessor';
import { button, downloadBlob, el, formatBytes } from './dom';
import {
  buildKindleChecks, summarizeKindleChecks, readBookMetadata, readBookPreview, writeBookMetadata,
  type BookMetadata, type BookPreview, type BookSection,
} from '../epub/tools/bookTools';
import { compareBookPreviews, comparisonSummary, type BookDifference } from '../epub/tools/bookComparison';
import { compareWords, type WordDiffSegment } from '../epub/tools/bookWordDiff';
import type { InlineRun } from '../epub/tools/readerInline';
import { metadataChanges, metadataChangeCount } from '../epub/tools/metadataDraft';

type ExtraTab = 'preview' | 'compare' | 'metadata' | 'kindle' | 'batch';
type Queue = (
  label: string,
  task: (ctx: { signal: AbortSignal; onProgress: (p: ProcessingProgress) => void }) => Promise<void>,
) => void;

interface Session {
  expanded: boolean;
  tab: ExtraTab;
  key?: Uint8Array | undefined;
  preview?: BookPreview | undefined;
  sourcePreview?: BookPreview | undefined;
  editedPreview?: BookPreview | undefined;
  comparison?: BookDifference[] | undefined;
  meta?: BookMetadata | undefined;
  metadataDraft?: BookMetadata | undefined;
  export?: { blob: Blob; name: string; bytes: Uint8Array; report: ValidationReport } | undefined;
  batchFiles: File[];
  batchZip?: Blob | undefined;
  batchStatus: string[];
  chapter: number;
  compareChapter: number;
  fontSize: number;
  message: string;
}

const sessions = new WeakMap<AppState, Session>();
const TABS: Array<[ExtraTab, string]> = [
  ['preview', 'Ler EPUB'], ['compare', 'Antes e depois'], ['metadata', 'Metadados'],
  ['kindle', 'Preparar Kindle'], ['batch', 'Em lote'],
];

function sessionFor(state: AppState): Session {
  let current = sessions.get(state);
  if (!current) {
    current = { expanded: false, tab: 'preview', batchFiles: [],
      batchStatus: [], chapter: 0, compareChapter: 0, fontSize: 18, message: '' };
    sessions.set(state, current);
  }
  if (current.key !== state.payload?.bytes) {
    current.key = state.payload?.bytes;
    current.preview = undefined;
    current.sourcePreview = undefined;
    current.editedPreview = undefined;
    current.comparison = undefined;
    current.meta = undefined;
    current.metadataDraft = undefined;
    current.export = undefined;
    current.chapter = 0;
    current.compareChapter = 0;
    current.message = '';
  }
  return current;
}

function paragraph(text: string): HTMLElement {
  return el('p', { className: 'muted', text });
}
function toolButton(label: string, enabled: boolean, click: () => void): HTMLButtonElement {
  const control = button(label, 'btn btn-secondary btn-small', click);
  control.disabled = !enabled;
  return control;
}
function sectionChooser(
  values: Array<{ title: string }>, index: number, changed: (index: number) => void,
): HTMLElement {
  const select = el('select', { attrs: { 'aria-label': 'Selecionar capítulo' } });
  for (const [i, item] of values.entries()) {
    select.append(el('option', {
      text: `${i + 1}. ${item.title}`,
      attrs: { value: String(i), ...(i === index ? { selected: 'selected' } : {}) },
    }));
  }
  select.addEventListener('change', () => changed(Number(select.value)));
  return select;
}

function renderInlineRun(run: InlineRun): Node {
  let node: Node = document.createTextNode(run.text);
  for (const mark of [...run.marks].reverse()) {
    const tag: 'strong' | 'em' | 'code' | 'sup' | 'sub' =
      mark === 'emphasis' ? 'em' : mark;
    const wrapper = el(tag);
    wrapper.append(node);
    node = wrapper;
  }
  return node;
}

function readerCard(section: BookSection, fontSize: number, label: string): HTMLElement {
  const content = el('div', { className: 'optional-reader-body' });
  content.style.fontSize = fontSize + 'px';
  content.append(el('h4', { text: section.title }));
  if (section.blocks?.length) {
    for (const block of section.blocks) {
      if (block.kind === 'image') {
        if (block.imageDataUrl) {
          content.append(el('figure', { className: 'optional-reader-figure', children: [
            el('img', { attrs: {
              src: block.imageDataUrl, alt: block.text || 'Ilustração do livro', loading: 'lazy',
              decoding: 'async',
            } }),
            block.text ? el('figcaption', { text: block.text }) : undefined,
          ] }));
        }
        continue;
      }
      const className = 'optional-reader-' + block.kind +
        (block.kind === 'heading' ? ' optional-reader-heading-level-' + (block.level ?? 2) : '');
      const element = block.kind === 'heading' ? el('h5', { className })
        : block.kind === 'quotation' ? el('blockquote', { className })
          : el('p', { className });
      if (block.kind === 'list-item') element.append('• ');
      if (block.runs?.length) {
        for (const run of block.runs) element.append(renderInlineRun(run));
      } else {
        element.append(block.text);
      }
      content.append(element);
    }
  } else {
    for (const part of section.text.split(/\\n\\n+/u).slice(0, 500)) {
      content.append(el('p', { text: part }));
    }
  }
  if (section.truncated) content.append(paragraph('Prévia reduzida para evitar sobrecarga de memória.'));
  return el('article', { className: 'optional-reader-card', children: [
    el('strong', { text: label }), content,
  ] });
}

function renderPreview(state: AppState, s: Session, rerender: () => void, enqueue: Queue): HTMLElement {
  const control = toolButton('Abrir leitura local', Boolean(state.payload) && !state.busy, () => {
    const payload = state.payload;
    if (!payload) return;
    enqueue('Preparar prévia EPUB', async ({ signal }) => {
      s.preview = await readBookPreview(payload.file.name, payload.bytes, signal);
      s.chapter = 0;
      s.message = s.preview.sections.length
        ? 'Prévia de leitura pronta. Imagens internas compatíveis são mostradas sem executar scripts ou recursos externos.'
        : 'Nenhum texto compatível foi recuperado para pré-visualização.';
    });
  });
  const view = s.preview;
  const scale = el('input', {
    attrs: { type: 'range', min: '14', max: '28', step: '2', value: String(s.fontSize),
      'aria-label': 'Tamanho do texto da prévia' },
  });
  scale.addEventListener('input', () => {
    s.fontSize = Number(scale.value);
    const node = scale.closest('.optional-tool-content')
      ?.querySelector<HTMLElement>('.optional-reader-body');
    if (node) node.style.fontSize = s.fontSize + 'px';
  });
  const chapter = view?.sections[s.chapter] ?? view?.sections[0];
  return el('div', { className: 'optional-tool-content', children: [
    paragraph('Prévia segura de capítulos, parágrafos, títulos e imagens internas compatíveis. Estilos originais, fontes e layout fixo ainda podem diferir do leitor real. Scripts e recursos remotos não são carregados.'),
    control,
    view ? paragraph(`${view.sections.length} seção(ões) carregada(s)${view.omitted ? `, ${view.omitted} omitida(s)` : ''}.${view.fixedLayout ? ' Este livro usa layout fixo.' : ''}`) : undefined,
    view?.sections.length ? el('div', { className: 'optional-reader-controls', children: [
      toolButton('Anterior', s.chapter > 0, () => { s.chapter -= 1; rerender(); }),
      sectionChooser(view.sections, s.chapter, (n) => { s.chapter = n; rerender(); }),
      toolButton('Próximo', s.chapter < view.sections.length - 1, () => {
        s.chapter += 1; rerender();
      }),
      el('label', { children: [el('span', { text: 'Fonte' }), scale] }),
    ] }) : undefined,
    chapter ? readerCard(chapter, s.fontSize, 'Prévia do capítulo') : undefined,
  ] });
}

function renderDiffColumn(label: string, fragments: WordDiffSegment[]): HTMLElement {
  const excerpt = el('p', { className: 'optional-diff-excerpt' });
  for (const fragment of fragments) {
    const name = fragment.kind === 'same' ? 'optional-diff-same'
      : fragment.kind === 'added' ? 'optional-diff-added' : 'optional-diff-removed';
    excerpt.append(el('span', { className: name, text: fragment.text + ' ' }));
  }
  return el('article', { className: 'optional-diff-column', children: [
    el('strong', { text: label }), excerpt,
  ] });
}

function renderWordDiff(row: BookDifference): HTMLElement | undefined {
  const before = row.before;
  const after = row.after;
  if (row.status !== 'text-changed' || !before || !after) return undefined;
  const details = el('details', { className: 'optional-diff-details', children: [
    el('summary', { text: 'Ver palavras inseridas e removidas' }),
  ] });
  let prepared = false;
  details.addEventListener('toggle', () => {
    if (!details.isConnected || !details.open || prepared) return;
    prepared = true;
    const difference = compareWords(before.text, after.text);
    details.append(el('div', { className: 'optional-diff-inside', children: [
      paragraph(difference.truncated
        ? 'Amostra limitada para proteger a memória do navegador. As contagens abaixo incluem apenas a parte exibida.'
        : 'Diferenças destacadas no trecho alterado. Contexto idêntico pode ser abreviado.'),
      paragraph((difference.truncated ? 'Pelo menos ' : '') +
        difference.addedWords + ' palavra(s) incluída(s) e ' +
        difference.removedWords + ' removida(s) nesta amostra.'),
      el('div', { className: 'optional-diff-grid', children: [
        renderDiffColumn('Antes', difference.before),
        renderDiffColumn('Depois', difference.after),
      ] }),
    ] }));
  });
  return details;
}

function renderCompare(state: AppState, s: Session, rerender: () => void, enqueue: Queue): HTMLElement {
  const source = state.originalSource;
  const current = state.payload;
  const hasChanged = Boolean(source && (s.export || current?.bytes !== source.bytes));
  const run = toolButton('Comparar versões', hasChanged && !state.busy, () => {
    if (!source || !current) return;
    enqueue('Comparar EPUB original e atual', async ({ signal }) => {
      const before = await readBookPreview(source.fileName, source.bytes, signal);
      const target = s.export
        ? { name: s.export.name, bytes: s.export.bytes }
        : { name: current.file.name, bytes: current.bytes };
      const after = await readBookPreview(target.name, target.bytes, signal);
      if (signal.aborted) throw new DOMException('Comparação cancelada.', 'AbortError');
      s.sourcePreview = before;
      s.editedPreview = after;
      s.comparison = compareBookPreviews(before, after);
      s.compareChapter = 0;
      s.message = 'Comparação pronta: ' + comparisonSummary(s.comparison);
    });
  });
  const rows = s.comparison ?? [];
  const selected = rows[Math.min(s.compareChapter, Math.max(rows.length - 1, 0))];
  const status: Record<BookDifference['status'], string> = {
    same: 'Texto e imagens carregadas sem mudanças detectadas',
    'text-changed': 'Diferença de texto detectada',
    'images-changed': 'Imagens internas diferentes',
    added: 'Seção adicionada',
    removed: 'Seção removida',
  };
  return el('div', { className: 'optional-tool-content', children: [
    paragraph('Comparação de texto, capítulos e imagens internas carregadas. Não é uma certificação de fidelidade tipográfica, CSS ou paginação. Se caminhos mudarem, o alinhamento exige conferência.'),
    run,
    !hasChanged ? paragraph('Depois de reparar ou editar metadados, a comparação ficará disponível aqui.') : undefined,
    rows.length ? paragraph(comparisonSummary(rows)) : undefined,
    rows.length ? sectionChooser(rows.map((row) => ({ title: row.label })), s.compareChapter,
      (index) => { s.compareChapter = index; rerender(); }) : undefined,
    selected ? el('div', { className: 'optional-comparison-summary', children: [
      el('strong', { text: status[selected.status] }),
      paragraph(`${selected.addedWords} palavra(s) incluída(s) no trecho alterado; ${selected.removedWords} removida(s).`),
      selected.approximate
        ? paragraph('O caminho deste capítulo mudou. Correspondência aproximada pelo título e posição.')
        : undefined,
    ] }) : undefined,
    selected ? el('div', { className: 'optional-compare-grid', children: [
      readerCard(selected.before ?? { path: '', title: 'Seção ausente',
        text: 'Este capítulo não existe nesta versão.', truncated: false }, s.fontSize, 'Original'),
      readerCard(selected.after ?? { path: '', title: 'Seção ausente',
        text: 'Este capítulo não existe nesta versão.', truncated: false }, s.fontSize, 'Atual'),
    ] }) : undefined,
    selected ? renderWordDiff(selected) : undefined,
  ] });
}

const FIELDS: Array<[keyof BookMetadata, string]> = [
  ['title', 'Título'], ['creator', 'Autor principal'],
  ['additionalCreators', 'Outros autores e colaboradores (um por linha)'],
  ['language', 'Idioma (pt-BR)'],
  ['identifier', 'Identificador principal'], ['publisher', 'Editora'], ['date', 'Data de publicação'],
  ['description', 'Descrição'], ['subject', 'Assunto'], ['series', 'Série'],
  ['seriesIndex', 'Volume da série'],
];

function renderMetadata(state: AppState, s: Session, rerender: () => void, enqueue: Queue): HTMLElement {
  const original = s.meta;
  const draft = s.metadataDraft;
  const changedCount = original && draft ? metadataChangeCount(original, draft) : 0;
  const load = toolButton('Carregar metadados', Boolean(state.payload) && !state.busy, () => {
    const payload = state.payload;
    if (!payload) return;
    if (s.meta && s.metadataDraft && metadataChangeCount(s.meta, s.metadataDraft) > 0 &&
      !window.confirm('Você tem alterações não salvas. Descartá-las e reler os metadados?')) return;
    enqueue('Ler metadados EPUB', async ({ signal }) => {
      const loaded = await readBookMetadata(payload.file.name, payload.bytes, signal);
      if (signal.aborted) throw new DOMException('Leitura cancelada.', 'AbortError');
      s.meta = loaded;
      s.metadataDraft = { ...loaded };
      s.export = undefined;
      s.message = 'Metadados carregados. Campos vazios preservam os dados originais.';
    });
  });
  const changedLabel = el('p', {
    className: 'muted optional-meta-changes',
    text: changedCount ? changedCount + ' campo(s) alterado(s) para a nova cópia.' :
      'Nenhuma alteração pendente.',
    attrs: { role: 'status' },
  });
  const inputs = original && draft ? FIELDS.map(([key, title]) => {
    const input = key === 'description' || key === 'additionalCreators'
      ? el('textarea', { attrs: {
        rows: key === 'description' ? '3' : '4',
        maxlength: key === 'description' ? '6000' : '3000',
        'aria-description': key === 'additionalCreators'
          ? 'Um nome por linha. Os vínculos editoriais existentes são preservados.'
          : 'Texto de descrição editorial',
      }, text: draft[key] })
      : el('input', { attrs: { type: 'text', value: draft[key],
        maxlength: '300', autocomplete: 'off' } });
    input.addEventListener('input', () => {
      const activeDraft = s.metadataDraft;
      const activeOriginal = s.meta;
      if (!activeDraft || !activeOriginal) return;
      activeDraft[key] = input.value;
      s.export = undefined;
      const count = metadataChangeCount(activeOriginal, activeDraft);
      changedLabel.textContent = count
        ? count + ' campo(s) alterado(s) para a nova cópia.'
        : 'Nenhuma alteração pendente.';
      save.disabled = !count || state.busy;
      const wrapper = input.closest('.optional-tool-content');
      wrapper?.querySelector('.optional-meta-export')?.remove();
      wrapper?.querySelector('.optional-meta-validation')?.remove();
    });
    return el('label', { className: 'converter-field', children: [el('span', { text: title }), input] });
  }) : [];
  const save = toolButton('Gerar EPUB com metadados', changedCount > 0 && !state.busy, () => {
    const payload = state.payload;
    if (!payload || !s.meta || !s.metadataDraft) return;
    const changes = metadataChanges(s.meta, s.metadataDraft);
    if (!Object.keys(changes).length) return;
    const previousCredits = s.meta.additionalCreators.split(/\\r?\\n/u).filter(Boolean).length;
    const nextCredits = changes.additionalCreators
      ? changes.additionalCreators.split(/\\r?\\n/u).filter(Boolean).length
      : previousCredits;
    const removing = nextCredits < previousCredits;
    const question = removing
      ? 'Você está removendo crédito(s) adicionais. Vínculos editoriais impedirão exclusões perigosas. Gerar uma cópia?'
      : 'Gerar uma cópia separada com os metadados alterados, preservando o arquivo original?';
    if (!window.confirm(question)) return;
    enqueue('Atualizar metadados EPUB', async ({ signal }) => {
      const result = await writeBookMetadata(payload.file.name, payload.bytes, changes, signal);
      if (signal.aborted) throw new DOMException('Edição cancelada.', 'AbortError');
      s.export = { blob: result.blob, name: result.fileName,
        bytes: result.bytes, report: result.report };
      s.sourcePreview = undefined;
      s.editedPreview = undefined;
      s.comparison = undefined;
      s.message = 'Nova cópia validada. O EPUB original foi preservado.';
    });
  });
  const reset = toolButton('Descartar alterações', changedCount > 0 && !state.busy, () => {
    if (!s.meta || !window.confirm('Descartar as alterações não salvas nos metadados?')) return;
    s.metadataDraft = { ...s.meta };
    s.export = undefined;
    s.message = 'Alterações descartadas. Os valores originais foram restaurados.';
    rerender();
  });
  return el('div', { className: 'optional-tool-content', children: [
    paragraph('Edite apenas o necessário. Campos vazios não apagam valores existentes; os outros autores são separados por linha. Vínculos editoriais são preservados e EPUBs assinados não podem ser editados.'),
    load,
    original && draft ? el('div', { className: 'optional-metadata-grid', children: inputs }) : undefined,
    original && draft ? changedLabel : undefined,
    original && draft ? el('div', { className: 'optional-metadata-actions', children: [
      save, reset,
    ] }) : undefined,
    s.export ? button('Baixar EPUB com metadados', 'btn btn-primary btn-small optional-meta-export',
      () => downloadBlob(s.export!.blob, s.export!.name)) : undefined,
    s.export ? el('p', { className: 'muted optional-meta-validation',
      text: `Cópia validada: ${s.export.report.stats.errorCount} erro(s) e ${s.export.report.stats.warningCount} aviso(s).` }) : undefined,
  ] });
}

function renderKindle(state: AppState): HTMLElement {
  const report = state.report;
  const checks = report ? buildKindleChecks(report) : [];
  const summary = summarizeKindleChecks(checks);
  const statusNames = {
    ready: 'Verificado',
    review: 'Precisa de conferência',
    blocked: 'Bloqueio detectado',
  };
  const result = report ? el('div', { className: 'optional-kindle-summary', children: [
    el('strong', { text: summary.blocked
      ? summary.blocked + ' bloqueio(s) detectado(s) na verificação'
      : summary.review
        ? summary.review + ' ponto(s) para revisar antes de enviar'
        : 'Nenhum problema detectado nas verificações disponíveis' }),
    paragraph(summary.ready + ' item(ns) verificado(s) · ' + summary.review +
      ' ponto(s) para revisar · ' + summary.blocked + ' bloqueio(s).'),
  ] }) : paragraph('Valide o EPUB primeiro para receber recomendações sobre capa, navegação, metadados, arquivos ausentes e recursos externos.');
  return el('div', { className: 'optional-tool-content', children: [
    paragraph('Checklist local e orientativo para envio ao Kindle. Não garante que a Amazon aceite o EPUB nem que a aparência seja idêntica no dispositivo. Nenhum arquivo é enviado automaticamente.'),
    result,
    ...checks.map((check) => el('div', { className: 'optional-check', children: [
      el('strong', { text: check.label + ' · ' + statusNames[check.status] }),
      el('p', { className: 'muted', text: check.detail }),
      !check.ok ? el('p', { className: 'optional-kindle-action', text: 'O que fazer: ' + check.action })
        : undefined,
    ] })),
    el('a', { className: 'btn btn-secondary btn-small', text: 'Abrir Send to Kindle oficial',
      attrs: { href: 'https://www.amazon.com/sendtokindle', target: '_blank', rel: 'noopener noreferrer' } }),
  ] });
}

function renderBatch(state: AppState, s: Session, rerender: () => void, enqueue: Queue): HTMLElement {
  const input = el('input', { attrs: { type: 'file', accept: '.epub,application/epub+zip',
    multiple: 'multiple', 'aria-label': 'Escolher EPUBs para processamento em lote' } });
  input.disabled = state.busy;
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (files.length > 6 || total > 80 * 1024 * 1024 || files.some((file) =>
      !file.name.toLowerCase().endsWith('.epub') || file.size > MAX_FILE_SIZE_BYTES)) {
      s.message = 'Escolha até 6 EPUBs, com no máximo 80 MB somados.';
      s.batchFiles = [];
    } else {
      s.batchFiles = files;
      s.batchStatus = [];
      s.batchZip = undefined;
      s.message = files.length + ' arquivo(s) selecionado(s).';
    }
    rerender();
  });
  const start = toolButton('Validar e reparar lote', s.batchFiles.length > 0 && !state.busy, () => {
    const files = [...s.batchFiles];
    enqueue('Processar lote EPUB', async ({ signal, onProgress }) => {
      const processed = await processEpubBatch(files, signal, (phase, completed, total) =>
        onProgress({ phase, completed, total }));
      s.batchZip = processed.zip;
      s.batchStatus = processed.entries.map((entry) =>
        entry.source + ': ' + entry.status + ' (' + entry.detail + ')');
      s.message = 'Lote concluído. Confira o resultado de cada livro e baixe o ZIP.';
    });
  });
  return el('div', { className: 'optional-tool-content', children: [
    paragraph('Processamento local, sequencial e conservador. Até 6 EPUBs / 80 MB por lote para limitar o uso de memória. Um arquivo problemático não interrompe os demais.'),
    input,
    s.batchFiles.length ? paragraph(s.batchFiles.map((f) => `${f.name} (${formatBytes(f.size)})`).join(' · ')) : undefined,
    start,
    ...s.batchStatus.map((message) => el('p', { text: message })),
    s.batchZip ? button('Baixar resultados do lote (ZIP)', 'btn btn-primary btn-small', () =>
      downloadBlob(s.batchZip!, 'epub-repair-lote.zip')) : undefined,
  ] });
}

export function renderOptionalEpubTools(state: AppState, rerender: () => void, enqueue: Queue): HTMLElement {
  const s = sessionFor(state);
  const details = el('details', { className: 'panel optional-tools', children: [
    el('summary', { children: [
      el('strong', { text: 'Ferramentas extras (opcionais)' }),
      el('small', { text: 'Leitura, comparação, metadados, Kindle e lote, sem interferir no fluxo principal' }),
    ] }),
    el('div', { className: 'optional-tools-inner', children: [
      el('div', { className: 'optional-tablist', attrs: { role: 'group',
        'aria-label': 'Selecionar ferramenta opcional' }, children:
        TABS.map(([key, label]) => {
          const tab = button(label, 'btn btn-small ' + (s.tab === key ? 'btn-primary' : 'btn-ghost'), () => {
            s.tab = key;
            s.message = '';
            rerender();
          });
          tab.setAttribute('aria-pressed', String(s.tab === key));
          return tab;
        }) }),
      s.tab === 'preview' ? renderPreview(state, s, rerender, enqueue) : undefined,
      s.tab === 'compare' ? renderCompare(state, s, rerender, enqueue) : undefined,
      s.tab === 'metadata' ? renderMetadata(state, s, rerender, enqueue) : undefined,
      s.tab === 'kindle' ? renderKindle(state) : undefined,
      s.tab === 'batch' ? renderBatch(state, s, rerender, enqueue) : undefined,
      s.message ? el('p', { className: 'muted', attrs: { role: 'status' }, text: s.message }) : undefined,
    ] }),
  ] });
  details.open = s.expanded;
  details.addEventListener('toggle', () => {
    if (details.isConnected) s.expanded = details.open;
  });
  return details;
}
