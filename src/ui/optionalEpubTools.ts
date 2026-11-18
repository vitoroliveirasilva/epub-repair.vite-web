import type { AppState, ProcessingProgress } from '../app/state';
import type { ValidationReport } from '../epub';
import { processEpubBatch, MAX_BATCH_BYTES, MAX_BATCH_FILES,
  type BatchMode, type BatchEntry, type BatchFileProgress } from '../epub/tools/batchProcessor';
import { addBatchSelection } from '../epub/tools/batchSelection';
import { button, downloadBlob, el, formatBytes } from './dom';
import {
  readBookMetadata, readBookPreview, writeBookMetadata,
  type BookMetadata, type BookPreview, type BookSection,
} from '../epub/tools/bookTools';
import { compareBookPreviews, comparisonSummary, type BookDifference } from '../epub/tools/bookComparison';
import { compareWords, type WordDiffSegment } from '../epub/tools/bookWordDiff';
import type { InlineRun } from '../epub/tools/readerInline';
import type { ReaderPresentation } from '../epub/tools/readerPresentation';
import { metadataChanges, metadataChangeCount } from '../epub/tools/metadataDraft';

type ExtraTab = 'preview' | 'compare' | 'metadata';
type Queue = (
  label: string,
  task: (ctx: { signal: AbortSignal; onProgress: (p: ProcessingProgress) => void }) => Promise<void>,
) => void;

interface Session {
  expanded: boolean;
  tab: ExtraTab;
  batchWorkspaceActive: boolean;
  key?: Uint8Array | undefined;
  preview?: BookPreview | undefined;
  sourcePreview?: BookPreview | undefined;
  editedPreview?: BookPreview | undefined;
  comparison?: BookDifference[] | undefined;
  meta?: BookMetadata | undefined;
  metadataDraft?: BookMetadata | undefined;
  export?: { blob: Blob; name: string; bytes: Uint8Array; report: ValidationReport } | undefined;
  batchFiles: File[];
  batchMode: BatchMode;
  batchZip?: Blob | undefined;
  batchProgress: Array<BatchFileProgress | undefined>;
  batchEntries: BatchEntry[];
  batchCompleted: number;
  batchStarted: boolean;
  batchExpandedDetails: number[];
  batchError: boolean;
  chapter: number;
  compareChapter: number;
  fontSize: number;
  syncScroll: boolean;
  message: string;
}

const sessions = new WeakMap<AppState, Session>();
const TABS: Array<[ExtraTab, string]> = [
  ['preview', 'Ler EPUB'], ['compare', 'Antes e depois'], ['metadata', 'Metadados'],
];

function sessionFor(state: AppState): Session {
  let current = sessions.get(state);
  if (!current) {
    current = { expanded: false, tab: 'preview', batchWorkspaceActive: false,
      batchFiles: [], batchMode: 'repair',
      batchProgress: [], batchEntries: [], batchCompleted: 0,
      batchStarted: false, batchExpandedDetails: [], batchError: false,
      chapter: 0, compareChapter: 0, fontSize: 18,
      syncScroll: true, message: '' };
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

interface ReaderNoteNavigation {
  knownNotes: Set<string>;
  onOpenNote: (path: string, id: string) => void;
}

function renderInlineRun(
  run: InlineRun, availableNotes?: Set<string>,
  noteTargets?: Map<string, HTMLDetailsElement>,
  currentPath?: string, navigation?: ReaderNoteNavigation,
): Node {
  let node: Node = document.createTextNode(run.text);
  for (const mark of [...run.marks].reverse()) {
    const tag: 'strong' | 'em' | 'code' | 'sup' | 'sub' =
      mark === 'emphasis' ? 'em' : mark;
    const wrapper = el(tag);
    wrapper.append(node);
    node = wrapper;
  }
  if (run.hrefId && noteTargets) {
    const id = run.hrefId;
    const crossFile = Boolean(run.hrefPath && currentPath && run.hrefPath !== currentPath);
    const local = !crossFile && availableNotes?.has(id);
    const external = crossFile && Boolean(navigation?.knownNotes.has(run.hrefPath + '#' + id));
    if (local || external) {
      const link = el('button', { className: 'optional-reader-noteref',
        attrs: { type: 'button', 'aria-label': 'Abrir nota ' + run.text } });
      link.append(node);
      link.addEventListener('click', () => {
        if (external && run.hrefPath) {
          navigation?.onOpenNote(run.hrefPath, id);
          return;
        }
        const target = noteTargets.get(id);
        if (!target) return;
        target.open = true;
        target.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
        target.focus();
      });
      return link;
    }
  }
  return node;
}

function applyReaderPresentation(element: HTMLElement, presentation?: ReaderPresentation): void {
  if (!presentation) return;
  if (presentation.align) element.style.textAlign = presentation.align;
  if (presentation.indentEm !== undefined) element.style.textIndent = presentation.indentEm + 'em';
  if (presentation.fontSizeEm !== undefined) element.style.fontSize = presentation.fontSizeEm + 'em';
  if (presentation.fontFamily) element.style.fontFamily = presentation.fontFamily;
  if (presentation.weight) element.style.fontWeight = presentation.weight;
  if (presentation.italic !== undefined) element.style.fontStyle =
    presentation.italic ? 'italic' : 'normal';
  if (presentation.lineHeight !== undefined) element.style.lineHeight = String(presentation.lineHeight);
  if (presentation.beforeEm !== undefined) element.style.marginTop = presentation.beforeEm + 'em';
  if (presentation.afterEm !== undefined) element.style.marginBottom = presentation.afterEm + 'em';
}

export function readerCard(
  section: BookSection, fontSize: number, label: string,
  navigation?: ReaderNoteNavigation,
): HTMLElement {
  const content = el('div', { className: 'optional-reader-body' });
  content.style.fontSize = fontSize + 'px';
  content.append(el('h4', { text: section.title }));
  const notes = new Set((section.blocks ?? []).filter((block) =>
    block.kind === 'footnote' && block.noteId).map((block) => block.noteId!));
  const noteTargets = new Map<string, HTMLDetailsElement>();
  const appendRuns = (target: HTMLElement, runs?: InlineRun[], fallback = ''): void => {
    if (runs?.length) {
      for (const run of runs) {
        target.append(renderInlineRun(run, notes, noteTargets, section.path, navigation));
      }
    } else target.append(fallback);
  };
  let orderedIndex = 0;
  let previousOrdered = false;
  if (section.blocks?.length) {
    for (const block of section.blocks) {
      if (block.kind !== 'list-item' || !block.ordered) {
        orderedIndex = 0;
        previousOrdered = false;
      }
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
      if (block.kind === 'table' && block.table) {
        const table = el('table', { className: 'optional-reader-table' });
        if (block.table.caption) table.append(el('caption', { text: block.table.caption }));
        const tbody = el('tbody');
        for (const row of block.table.rows) {
          const tr = el('tr');
          for (const cell of row) {
            const td = el(cell.heading ? 'th' : 'td', { attrs: {
              ...(cell.heading ? { scope: 'col' } : {}),
              ...(cell.colspan > 1 ? { colspan: String(cell.colspan) } : {}),
              ...(cell.rowspan > 1 ? { rowspan: String(cell.rowspan) } : {}),
            } });
            appendRuns(td, cell.runs, cell.text);
            for (const image of cell.images ?? []) {
              td.append(el('figure', { className: 'optional-reader-cell-image', children: [
                el('img', { attrs: { src: image.imageDataUrl, alt: image.text ||
                  'Ilustração da célula', loading: 'lazy', decoding: 'async' } }),
              ] }));
            }
            tr.append(td);
          }
          tbody.append(tr);
        }
        table.append(tbody);
        content.append(el('div', { className: 'optional-reader-table-scroll',
          attrs: { tabindex: '0', role: 'region',
            'aria-label': 'Tabela do capítulo (deslize horizontalmente se necessário)' },
          children: [table] }));
        if (block.table.truncated) {
          content.append(paragraph('Tabela extensa: apenas parte das linhas ou células foi exibida.'));
        }
        continue;
      }
      if (block.kind === 'footnote') {
        const details = el('details', { className: 'optional-reader-footnote',
          attrs: { tabindex: '0', ...(block.noteId ? { 'data-reader-note': block.noteId } : {}) },
          children: [
            el('summary', { text: 'Nota de rodapé' }),
          ] });
        const value = el('p');
        appendRuns(value, block.runs, block.text);
        details.append(value);
        if (block.noteId && !noteTargets.has(block.noteId)) {
          noteTargets.set(block.noteId, details);
        }
        content.append(details);
        continue;
      }
      const className = 'optional-reader-' + block.kind +
        (block.kind === 'heading' ? ' optional-reader-heading-level-' + (block.level ?? 2) : '');
      const element = block.kind === 'heading' ? el('h5', { className })
        : block.kind === 'quotation' ? el('blockquote', { className })
          : el('p', { className });
      if (block.kind === 'list-item') {
        const ordered = Boolean(block.ordered);
        if (ordered) orderedIndex = previousOrdered ? orderedIndex + 1 : 1;
        previousOrdered = ordered;
        element.append(ordered ? String(orderedIndex) + '. ' : '• ');
      }
      appendRuns(element, block.runs, block.text);
      applyReaderPresentation(element, block.presentation);
      content.append(element);
    }
  } else {
    for (const part of section.text.split(/\n\n+/u).slice(0, 500)) {
      content.append(el('p', { text: part }));
    }
  }
  if (section.truncated) content.append(paragraph('Prévia reduzida para evitar sobrecarga de memória.'));
  return el('article', { className: 'optional-reader-card', children: [
    el('strong', { text: label }), content,
  ] });
}

function renderWorkbenchIntro(
  kicker: string, title: string, description?: string,
  action?: HTMLButtonElement, hint?: string,
): HTMLElement {
  return el('div', { className: 'optional-studio-tool-head workbench-panel-intro', children: [
    el('div', { className: 'optional-studio-tool-copy workbench-panel-copy', children: [
      el('span', { className: 'optional-studio-tool-kicker', text: kicker }),
      el('h4', { text: title }),
      description ? el('p', { text: description }) : undefined,
    ] }),
    action ? el('div', { className: 'optional-studio-tool-action workbench-panel-action', children: [
      action,
      hint ? el('small', { text: hint }) : undefined,
    ] }) : undefined,
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
  control.classList.add('workbench-reader-launch');
  control.setAttribute('aria-label', 'Abrir leitura local');
  control.setAttribute('title', 'Abrir leitura local');
  control.replaceChildren(el('span', { className: 'workbench-reader-launch-symbol',
    attrs: { 'aria-hidden': 'true' } }));
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
  const noteLocations = new Map<string, number>();
  view?.sections.forEach((section, index) => {
    section.blocks?.forEach((block) => {
      if (block.kind === 'footnote' && block.noteId) {
        noteLocations.set(section.path + '#' + block.noteId, index);
      }
    });
  });
  const navigation: ReaderNoteNavigation = {
    knownNotes: new Set(noteLocations.keys()),
    onOpenNote: (path, id) => {
      const targetIndex = noteLocations.get(path + '#' + id);
      if (targetIndex === undefined) return;
      s.chapter = targetIndex;
      rerender();
      requestAnimationFrame(() => {
        const target = [...document.querySelectorAll<HTMLDetailsElement>(
          '.optional-reader-card .optional-reader-footnote',
        )].find((node) => node.getAttribute('data-reader-note') === id);
        if (!target) return;
        target.open = true;
        target.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
        target.focus();
      });
    },
  };
  return el('div', { className: 'optional-tool-content optional-studio-reader workbench-tool-pane', children: [
    renderWorkbenchIntro(
      '01 / LEITURA NO NAVEGADOR', 'Seu livro, antes de baixar',
      undefined, state.payload ? control : undefined,
    ),
    el('p', { className: 'optional-studio-disclaimer workbench-footnote',
      text: 'Prévia segura: apenas estilos selecionados são reproduzidos, sem executar o CSS original. A apresentação no Kindle ou em outros leitores pode variar.' }),
    view ? paragraph(`${view.sections.length} seção(ões) carregada(s)${view.omitted ? `, ${view.omitted} omitida(s)` : ''}.${view.fixedLayout ? ' EPUB de layout fixo: esta é uma prévia simplificada, não uma reprodução da página.' : ''}`) : undefined,
    view?.sections.length ? el('div', { className: 'optional-reader-controls', children: [
      toolButton('Anterior', s.chapter > 0, () => { s.chapter -= 1; rerender(); }),
      sectionChooser(view.sections, s.chapter, (n) => { s.chapter = n; rerender(); }),
      toolButton('Próximo', s.chapter < view.sections.length - 1, () => {
        s.chapter += 1; rerender();
      }),
      el('label', { children: [el('span', { text: 'Fonte' }), scale] }),
    ] }) : undefined,
    chapter ? readerCard(chapter, s.fontSize, 'Prévia do capítulo', navigation) : undefined,
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

export function comparisonCards(
  row: BookDifference, fontSize: number, syncScroll = true,
): HTMLElement {
  const left = readerCard(row.before ?? { path: '', title: 'Seção ausente',
    text: 'Este capítulo não existe nesta versão.', truncated: false }, fontSize, 'Original');
  const right = readerCard(row.after ?? { path: '', title: 'Seção ausente',
    text: 'Este capítulo não existe nesta versão.', truncated: false }, fontSize, 'Atual');
  if (syncScroll) {
    let locked = false;
    const connect = (source: HTMLElement, destination: HTMLElement): void => {
      source.addEventListener('scroll', () => {
        if (locked) return;
        const sourceRange = source.scrollHeight - source.clientHeight;
        const destinationRange = Math.max(0, destination.scrollHeight - destination.clientHeight);
        if (sourceRange <= 0 || destinationRange <= 0) return;
        locked = true;
        destination.scrollTop = (source.scrollTop / sourceRange) * destinationRange;
        window.setTimeout(() => { locked = false; }, 0);
      });
    };
    connect(left, right);
    connect(right, left);
  }
  return el('div', { className: 'optional-compare-grid', children: [left, right] });
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
  const sync = el('input', { attrs: {
    type: 'checkbox', 'aria-label': 'Sincronizar rolagem dos dois painéis',
    ...(s.syncScroll ? { checked: 'checked' } : {}),
  } });
  sync.addEventListener('change', () => { s.syncScroll = sync.checked; rerender(); });
  const selected = rows[Math.min(s.compareChapter, Math.max(rows.length - 1, 0))];
  const status: Record<BookDifference['status'], string> = {
    same: 'Texto e imagens carregadas sem mudanças detectadas',
    'text-changed': 'Diferença de texto detectada',
    'images-changed': 'Imagens internas diferentes',
    'structure-changed': 'Mudança na estrutura editorial',
    'format-changed': 'Mudança na formatação do texto',
    'style-changed': 'Arquivo CSS ou estilo declarado alterado',
    added: 'Seção adicionada',
    removed: 'Seção removida',
  };
  return el('div', { className: 'optional-tool-content workbench-tool-pane', children: [
    renderWorkbenchIntro(
      '02 / COMPARAÇÃO EDITORIAL', 'Veja o que realmente mudou',
      'Compare organização, texto, imagens e estilos do EPUB original com a nova versão.',
      run, !hasChanged ? 'Disponível após reparar ou editar o EPUB.' : undefined,
    ),
    el('p', { className: 'workbench-footnote',
      text: 'Comparação local e orientativa. Não reproduz pixels, fontes incorporadas nem a paginação dos leitores.' }),
    rows.length ? paragraph(comparisonSummary(rows)) : undefined,
    rows.length && ((s.sourcePreview?.omitted ?? 0) > 0 ||
      (s.editedPreview?.omitted ?? 0) > 0 ||
      s.sourcePreview?.sections.some((section) => section.truncated) ||
      s.editedPreview?.sections.some((section) => section.truncated))
      ? paragraph('Comparação parcial: capítulos ou trechos foram limitados para proteger a memória do navegador.')
      : undefined,
    rows.length ? sectionChooser(rows.map((row) => ({ title: row.label })), s.compareChapter,
      (index) => { s.compareChapter = index; rerender(); }) : undefined,
    rows.length ? el('label', { className: 'optional-compare-sync', children: [
      sync, el('span', { text: 'Sincronizar rolagem proporcional dos painéis' }),
    ] }) : undefined,
    selected ? el('div', { className: 'optional-comparison-summary', children: [
      el('strong', { text: status[selected.status] }),
      selected.aspects.includes('text') || selected.status === 'added' || selected.status === 'removed'
        ? paragraph(`${selected.addedWords} palavra(s) incluída(s) no trecho alterado; ${selected.removedWords} removida(s).`)
        : undefined,
      selected.aspects.length ? paragraph('Aspectos alterados: ' + selected.aspects.map((aspect) => ({
        text: 'texto', images: 'imagens', structure: 'títulos, tabelas ou organização',
        format: 'marcação tipográfica', styles: 'CSS/classes declarados',
      }[aspect])).join(', ') + '.') : undefined,
      selected.aspects.includes('styles')
        ? paragraph('O estilo declarado mudou, mas esta prévia simplificada não executa o CSS original. Confirme a aparência no leitor final.')
        : undefined,
      selected.approximate
        ? paragraph('O caminho deste capítulo mudou. Correspondência aproximada pelo título único; confira manualmente.')
        : undefined,
    ] }) : undefined,
    selected ? comparisonCards(selected, s.fontSize, s.syncScroll) : undefined,
    selected ? renderWordDiff(selected) : undefined,
  ] });
}

const FIELDS: Array<[keyof BookMetadata, string]> = [
  ['title', 'Título'], ['creator', 'Autor principal'],
  ['additionalCreators', 'Outros autores (um por linha)'],
  ['additionalCreatorRoles', 'Funções dos autores adicionais (códigos MARC, um por linha)'],
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
    const input = key === 'description' || key === 'additionalCreators' ||
      key === 'additionalCreatorRoles'
      ? el('textarea', { attrs: {
        rows: key === 'description' ? '3' : '4',
        maxlength: key === 'description' ? '6000' :
          key === 'additionalCreatorRoles' ? '500' : '3000',
        'aria-description': key === 'additionalCreators'
          ? 'Um nome por linha. A reordenação conserva as funções ligadas a cada nome.'
          : key === 'additionalCreatorRoles'
            ? 'Alinhe cada código à linha do autor correspondente. ' +
              'Use aut para autor, edt para editor, trl para tradutor e ill para ilustrador. ' +
              'Linhas vazias preservam funções existentes.'
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
  return el('div', { className: 'optional-tool-content workbench-tool-pane', children: [
    renderWorkbenchIntro(
      '03 / DADOS DA OBRA', 'Metadados sob seu controle',
      'Revise título, autoria, idioma e informações editoriais, preservando o EPUB original.',
      load, !state.payload ? 'Selecione um EPUB na área de envio para começar.' : undefined,
    ),
    el('details', { className: 'workbench-safety-notes', children: [
      el('summary', { text: 'Como tratamos os metadados' }),
      el('p', { text: 'Campos vazios preservam os dados originais. Ao reorganizar autores, ' +
        'seus vínculos editoriais acompanham cada nome. Funções MARC opcionais usam uma ' +
        'linha por autor adicional; uma linha vazia não apaga a função existente. ' +
        'Autores vinculados não são removidos silenciosamente e EPUBs assinados não são editados.' }),
    ] }),
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

function resetBatchOutput(s: Session): void {
  s.batchZip = undefined;
  s.batchProgress = [];
  s.batchEntries = [];
  s.batchStarted = false;
  s.batchCompleted = 0;
  s.batchExpandedDetails = [];
}

function selectBatchFiles(s: Session, files: readonly File[]): void {
  const selection = addBatchSelection(s.batchFiles, files);
  if (selection.error) {
    s.batchError = true;
    s.message = selection.error;
    return;
  }
  s.batchError = false;
  s.batchFiles = selection.files;
  resetBatchOutput(s);
  s.message = selection.ignored
    ? selection.ignored + (selection.ignored === 1
      ? ' arquivo incompatível foi ignorado.' : ' arquivos incompatíveis foram ignorados.')
    : '';
}

export function isBatchWorkspaceActive(state: AppState): boolean {
  return sessionFor(state).batchWorkspaceActive;
}

export function setBatchWorkspaceActive(state: AppState, active: boolean): void {
  const session = sessionFor(state);
  session.batchWorkspaceActive = active;
  if (active) session.expanded = false;
}

export function openBatchWithFiles(state: AppState, files: readonly File[]): void {
  const session = sessionFor(state);
  session.batchWorkspaceActive = true;
  session.expanded = false;
  selectBatchFiles(session, files);
}

function batchProgressLabel(progress?: BatchFileProgress): string {
  if (!progress) return 'Na fila';
  switch (progress.stage) {
    case 'reading': return 'Lendo';
    case 'validating': return 'Verificando';
    case 'repairing': return 'Corrigindo';
    case 'optimizing': return 'Otimizando';
    case 'packing': return 'Finalizando';
    case 'completed': return progress.status ?? 'Concluído';
    case 'failed': return progress.status ?? 'Falhou';
  }
}

function batchResultTone(entry?: BatchEntry, progress?: BatchFileProgress): string {
  const status = entry?.status ?? progress?.status;
  if (status === 'recusado' || status === 'falhou') return 'error';
  if (status === 'revisão manual') return 'warning';
  if (entry || progress?.stage === 'completed') return 'success';
  if (progress && progress.stage !== 'failed') return 'working';
  return 'queued';
}

export function renderBatchWorkspace(
  state: AppState, rerender: () => void, enqueue: Queue,
  cancelAll: () => void,
): HTMLElement {
  const s = sessionFor(state);
  const count = s.batchFiles.length;
  const totalBytes = s.batchFiles.reduce((sum, file) => sum + file.size, 0);
  return el('section', {
    className: 'panel batch-workspace batch-studio',
    attrs: { id: 'batch-workspace', tabindex: '-1',
      'aria-labelledby': 'batch-workspace-title' },
    children: [
      el('header', { className: 'batch-studio-header', children: [
        el('div', { className: 'batch-studio-intro', children: [
          el('span', { className: 'batch-studio-eyebrow', text: 'PROCESSAMENTO EM LOTE' }),
          el('h2', { text: 'Vários livros. Um só fluxo.',
            attrs: { id: 'batch-workspace-title' } }),
          el('p', { text: 'Organize os EPUBs, escolha a operação e baixe tudo em um ZIP.' }),
        ] }),
        el('div', { className: 'batch-studio-counter',
          attrs: { 'aria-label': count + ' de ' + MAX_BATCH_FILES + ' arquivos selecionados' },
          children: [
            el('strong', { text: String(count).padStart(2, '0') }),
            el('span', { text: '/ ' + String(MAX_BATCH_FILES).padStart(2, '0') }),
            el('small', { text: 'LIVROS' }),
          ],
        }),
      ] }),
      renderBatch(state, s, rerender, enqueue, cancelAll, totalBytes),
    ],
  });
}

function renderBatch(
  state: AppState, s: Session, rerender: () => void,
  enqueue: Queue, cancelAll: () => void, totalBytes: number,
): HTMLElement {
  const count = s.batchFiles.length;
  const hasFiles = count > 0;
  const completed = s.batchZip ? count : s.batchCompleted;
  const inProgress = state.busy && s.batchStarted;
  const outputReady = Boolean(s.batchZip);
  const input = el('input', {
    className: 'visually-hidden',
    attrs: { id: 'batch-epub-input', type: 'file',
      accept: '.epub,application/epub+zip', multiple: 'multiple',
      'aria-label': 'Adicionar EPUBs ao lote' },
  });
  input.disabled = state.busy;
  const addFiles = (files: readonly File[]): void => {
    if (state.busy || !files.length) return;
    selectBatchFiles(s, files);
    rerender();
  };
  input.addEventListener('change', () => addFiles(Array.from(input.files ?? [])));

  const zone = el('label', {
    className: 'optional-batch-dropzone batch-workspace-upload batch-studio-upload',
    attrs: {
      for: 'batch-epub-input',
      tabindex: state.busy ? '-1' : '0',
      role: 'button',
      'aria-label': 'Adicionar livros EPUB à seleção',
      'aria-disabled': String(state.busy),
    },
    children: [
      el('span', { className: 'batch-studio-upload-icon',
        attrs: { 'aria-hidden': 'true' }, text: '+' }),
      el('span', { className: 'batch-studio-upload-copy', children: [
        el('strong', { text: hasFiles ? 'Adicionar mais livros' : 'Arraste seus EPUBs aqui' }),
        el('small', { text: hasFiles ? 'Arraste mais arquivos ou selecione no dispositivo'
          : 'Escolha arquivos do seu dispositivo ou solte-os nesta área' }),
      ] }),
      el('span', { className: 'batch-studio-upload-action',
        text: hasFiles ? 'Adicionar EPUBs' : 'Escolher arquivos' }),
      input,
    ],
  });
  zone.addEventListener('keydown', (event) => {
    if (state.busy || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    input.click();
  });
  for (const type of ['dragenter', 'dragover']) {
    zone.addEventListener(type, (event) => {
      event.preventDefault();
      if (!state.busy) zone.classList.add('optional-batch-dragging');
    });
  }
  zone.addEventListener('dragleave', (event) => {
    if (!zone.contains(event.relatedTarget as Node | null)) {
      zone.classList.remove('optional-batch-dragging');
    }
  });
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('optional-batch-dragging');
    addFiles(Array.from(event.dataTransfer?.files ?? []));
  });

  const clear = button('Limpar', 'btn btn-ghost btn-small batch-studio-clear', () => {
    s.batchFiles = [];
    resetBatchOutput(s);
    s.batchError = false;
    s.message = '';
    rerender();
  });
  clear.disabled = !hasFiles || state.busy;

  const fileRows = s.batchFiles.map((file, index) => {
    const progress = s.batchProgress[index];
    const result = s.batchEntries[index];
    const tone = batchResultTone(result, progress);
    const statusText = result?.status ?? batchProgressLabel(progress);
    const remove = button('Remover', 'btn btn-ghost btn-small batch-studio-remove', () => {
      s.batchFiles.splice(index, 1);
      resetBatchOutput(s);
      s.batchError = false;
      s.message = '';
      rerender();
    });
    remove.disabled = state.busy;
    remove.setAttribute('aria-label', 'Remover ' + file.name + ' do lote');
    const detail = result ? el('details', {
      className: 'batch-studio-result-detail',
      children: [
        el('summary', { text: 'Ver resultado deste livro' }),
        el('div', { children: [
          el('p', { text: result.detail }),
          el('small', { text: result.output
            ? 'EPUB exportado: ' + result.output + ' · Relatório: ' + result.report
            : 'Relatório: ' + result.report }),
        ] }),
      ],
    }) : undefined;
    if (detail) {
      detail.open = s.batchExpandedDetails.includes(index);
      detail.addEventListener('toggle', () => {
        if (!detail.isConnected) return;
        const expanded = s.batchExpandedDetails.includes(index);
        if (detail.open && !expanded) s.batchExpandedDetails.push(index);
        if (!detail.open && expanded) {
          s.batchExpandedDetails = s.batchExpandedDetails.filter((item) => item !== index);
        }
      });
    }
    return el('li', { className: 'batch-studio-file-row', children: [
      el('div', { className: 'batch-studio-file-main', children: [
        el('span', { className: 'batch-studio-file-number',
          attrs: { 'aria-hidden': 'true' }, text: String(index + 1).padStart(2, '0') }),
        el('div', { className: 'batch-studio-file-meta', children: [
          el('strong', { text: file.name, attrs: { title: file.name } }),
          el('small', { text: formatBytes(file.size) }),
        ] }),
        el('span', { className: 'batch-studio-file-status batch-studio-status-' + tone,
          attrs: { title: progress?.detail ?? result?.detail ?? statusText },
          text: statusText }),
        remove,
      ] }),
      detail,
    ] });
  });
  const fileList = el('div', {
    className: 'batch-studio-file-scroll',
    attrs: { tabindex: '0', role: 'region',
      'aria-label': 'Lista de arquivos EPUB selecionados' },
    children: hasFiles
      ? [el('ul', { className: 'optional-batch-files batch-workspace-files',
          children: fileRows })]
      : [el('div', { className: 'batch-studio-empty', children: [
          el('strong', { text: 'Nenhum livro na lista' }),
          el('small', { text: 'Adicione entre 1 e ' + MAX_BATCH_FILES +
            ' EPUBs para começar. O limite total é de ' +
            formatBytes(MAX_BATCH_BYTES) + '.' }),
        ] })],
  });

  const message = s.batchError || (!state.busy && state.error && s.batchStarted && !s.batchZip)
    ? el('p', { className: 'batch-studio-alert',
        attrs: { role: 'alert' },
        text: s.batchError ? s.message : state.error ?? '' })
    : s.message
      ? el('p', { className: 'batch-studio-notice',
          attrs: { role: 'status' }, text: s.message })
      : undefined;

  const uploadSide = el('section', {
    className: 'batch-studio-library',
    attrs: { 'aria-label': 'Arquivos do processamento em lote' },
    children: [
      el('header', { className: 'batch-studio-section-heading', children: [
        el('div', { children: [
          el('span', { className: 'batch-studio-section-index', text: '01 / ARQUIVOS' }),
          el('h3', { text: 'Sua biblioteca' }),
        ] }),
        hasFiles ? clear : undefined,
      ] }),
      zone,
      el('div', { className: 'batch-studio-file-heading', children: [
        el('strong', { text: count + (count === 1 ? ' EPUB selecionado'
          : ' EPUBs selecionados') }),
        el('small', { text: formatBytes(totalBytes) + ' de ' +
          formatBytes(MAX_BATCH_BYTES) }),
      ] }),
      fileList,
      el('div', { className: 'batch-studio-capacity', children: [
        el('div', { children: [
          el('span', { text: 'Espaço utilizado' }),
          el('strong', { text: Math.round(totalBytes / MAX_BATCH_BYTES * 100) + '%' }),
        ] }),
        el('progress', { attrs: { max: String(MAX_BATCH_BYTES),
          value: String(totalBytes), 'aria-label': 'Espaço total de EPUBs utilizado' } }),
        el('small', { text: 'Até ' + MAX_BATCH_FILES + ' livros · ' +
          formatBytes(MAX_BATCH_BYTES) + ' no total' }),
      ] }),
      message,
    ],
  });

  const choices = el('fieldset', {
    className: 'optional-batch-mode batch-workspace-modes batch-studio-modes',
    children: [
      el('legend', { text: 'Escolha o tipo de processamento' }),
      ...([
        ['repair', 'Corrigir e melhorar', 'Reparos e melhorias seguras. Gera novos EPUBs.'],
        ['validate', 'Somente verificar', 'Apenas diagnósticos, sem alterar os livros.'],
      ] as const).map(([mode, title, description]) => {
        const radio = el('input', { attrs: {
          type: 'radio', name: 'optional-batch-mode', value: mode,
          ...(s.batchMode === mode ? { checked: 'checked' } : {}),
        } });
        radio.disabled = state.busy;
        radio.addEventListener('change', () => {
          if (!radio.checked || state.busy) return;
          s.batchMode = mode;
          resetBatchOutput(s);
          s.batchError = false;
          s.message = '';
          rerender();
        });
        return el('label', { className: 'optional-batch-choice batch-studio-choice',
          children: [radio, el('span', { children: [
            el('strong', { text: title }), el('small', { text: description }),
          ] })],
        });
      }),
    ],
  });

  const start = button(
    s.batchMode === 'repair' ? 'Corrigir ' + count + (count === 1 ? ' EPUB' : ' EPUBs')
      : 'Verificar ' + count + (count === 1 ? ' EPUB' : ' EPUBs'),
    'btn btn-primary batch-workspace-start batch-studio-primary',
    () => {
      if (!s.batchFiles.length || state.busy) return;
      const files = [...s.batchFiles];
      const mode = s.batchMode;
      resetBatchOutput(s);
      s.batchStarted = true;
      s.batchProgress = files.map(() => undefined);
      s.batchError = false;
      s.message = '';
      enqueue(mode === 'repair' ? 'Corrigir lote de EPUBs' : 'Verificar lote de EPUBs',
        async ({ signal, onProgress }) => {
          const processed = await processEpubBatch(files, signal,
            (phase, done, total, detail) => {
              if (detail && detail.source !== 'ZIP final') {
                s.batchProgress[detail.index] = detail;
                if (detail.stage === 'completed' || detail.stage === 'failed') {
                  s.batchCompleted = done;
                }
              }
              onProgress({ phase, completed: done, total });
            }, { mode, includeOptimizations: true });
          s.batchZip = processed.zip;
          s.batchEntries = processed.entries;
          s.batchCompleted = files.length;
          s.message = '';
        });
    },
  );
  start.disabled = !hasFiles || state.busy;

  const download = outputReady ? button(
    s.batchMode === 'repair' ? 'Baixar EPUBs e relatórios' : 'Baixar relatórios',
    'btn btn-primary batch-workspace-download-button batch-studio-primary',
    () => downloadBlob(s.batchZip!, 'epub-repair-lote.zip'),
  ) : undefined;

  const aside = el('aside', { className: 'batch-studio-console', children: [
    el('header', { className: 'batch-studio-section-heading', children: [
      el('div', { children: [
        el('span', { className: 'batch-studio-section-index', text: '02 / AÇÃO' }),
        el('h3', { text: 'O que fazer?' }),
      ] }),
    ] }),
    choices,
    el('div', { className: 'batch-studio-action-area', children: [
      el('div', { className: 'batch-studio-summary', children: [
        el('span', { text: 'RESUMO DA OPERAÇÃO' }),
        el('strong', { text: count + (count === 1 ? ' livro' : ' livros') +
          ' · ' + (s.batchMode === 'repair' ? 'Correção' : 'Verificação') }),
        el('small', { text: hasFiles ? formatBytes(totalBytes) +
          ' selecionados · arquivos originais preservados'
          : 'Adicione arquivos para habilitar a operação' }),
      ] }),
      s.batchStarted ? el('div', { className: 'batch-studio-job-progress',
        attrs: { role: 'status', 'aria-live': 'polite' },
        children: [
          el('div', { children: [
            el('strong', { text: outputReady ? 'Processamento concluído'
              : inProgress ? 'Processando livros' : 'Processamento interrompido' }),
            el('span', { text: completed + ' / ' + count }),
          ] }),
          el('progress', { attrs: { max: String(Math.max(1, count)),
            value: String(completed), 'aria-label': 'Progresso do lote' } }),
        ],
      }) : undefined,
      outputReady ? el('div', { className: 'batch-studio-ready', children: [
        el('span', { className: 'batch-studio-ready-marker',
          attrs: { 'aria-hidden': 'true' }, text: '✓' }),
        el('div', { children: [
          el('strong', { text: 'Seu pacote está pronto' }),
          el('small', { text: s.batchMode === 'repair'
            ? s.batchEntries.filter((entry) => entry.changed).length +
              ' livro(s) melhorados · ' +
              s.batchEntries.filter((entry) => entry.output).length +
              ' EPUB(s) no ZIP'
            : s.batchEntries.length + ' relatórios individuais no ZIP' }),
        ] }),
      ] }) : undefined,
      download ?? (s.batchStarted && !state.busy
        ? button('Processar novamente', 'btn btn-primary batch-studio-primary',
          () => start.click()) : start),
      inProgress ? button('Cancelar processamento',
        'btn btn-secondary batch-workspace-cancel batch-studio-cancel', cancelAll) : undefined,
      outputReady ? button('Processar novamente',
        'btn btn-ghost batch-studio-repeat', () => {
          resetBatchOutput(s);
          s.message = '';
          rerender();
        }) : undefined,
      el('p', { className: 'batch-studio-reassurance',
        text: 'Tudo é processado no navegador. Seus arquivos originais não são alterados.' }),
    ] }),
  ] });

  return el('div', { className: 'optional-tool-content batch-workspace-content batch-studio-layout',
    children: [uploadSide, aside] });
}

function renderWorkbenchBookIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('workbench-book-mark');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const paths: Array<[string, string]> = [
    ['M32 19c-6.6-5.1-14.8-6.4-24.5-4v33c9.7-2.4 17.9-1.2 24.5 4 6.6-5.2 14.8-6.4 24.5-4V15c-9.7-2.4-17.9-1.1-24.5 4Z', 'workbench-book-outline'],
    ['M32 19v33', 'workbench-book-center'],
    ['M14 24c4.3-.2 8.2.4 11.5 2.3', 'workbench-book-detail'],
    ['M14 32c4.3-.2 8.2.4 11.5 2.3', 'workbench-book-detail'],
    ['M38.5 26.3c3.3-1.9 7.2-2.5 11.5-2.3', 'workbench-book-detail'],
    ['M38.5 34.3c3.3-1.9 7.2-2.5 11.5-2.3', 'workbench-book-detail'],
  ];

  for (const [d, className] of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', className);
    svg.append(path);
  }
  return svg;
}

export function renderOptionalEpubTools(state: AppState, rerender: () => void, enqueue: Queue): HTMLElement {
  const s = sessionFor(state);
  const details = el('details', {
    className: 'panel optional-tools optional-studio optional-workbench',
    attrs: { id: 'optional-tools' },
    children: [
      el('summary', { className: 'workbench-heading-row', children: [
        el('span', { className: 'workbench-header-art', attrs: { 'aria-hidden': 'true' },
          children: [
            el('span', { className: 'workbench-header-orbit' }),
            renderWorkbenchBookIcon(),
          ],
        }),
        el('span', { className: 'optional-studio-heading workbench-heading', children: [
          el('span', { className: 'workbench-heading-eyebrow-row', children: [
            el('span', { className: 'optional-studio-eyebrow', text: 'RECURSOS COMPLEMENTARES' }),
            el('span', { className: 'workbench-heading-count', text: '03 FERRAMENTAS' }),
          ] }),
          el('strong', { text: 'Ferramentas extras' }),
          el('small', { text: 'Leia, compare versões e edite metadados.' }),
        ] }),
        el('span', { className: 'optional-studio-summary-action workbench-disclosure',
          attrs: { 'aria-hidden': 'true' }, children: [
            el('span', { className: 'workbench-disclosure-label',
              text: s.expanded ? 'Recolher' : 'Explorar' }),
            el('span', { className: 'workbench-toggle-icon', children: [
              el('span', { className: 'workbench-toggle-line workbench-toggle-horizontal' }),
              el('span', { className: 'workbench-toggle-line workbench-toggle-vertical' }),
            ] }),
          ] }),
      ] }),
      el('div', { className: 'optional-tools-inner optional-studio-inner workbench-body', children: [
        el('div', { className: 'optional-tablist optional-studio-tabs workbench-navigation',
          attrs: { role: 'group', 'aria-label': 'Selecionar ferramenta opcional' },
          children: TABS.map(([key, label], index) => {
            const active = s.tab === key;
            const tab = button('', 'btn btn-small optional-studio-tab' +
              (active ? ' optional-studio-tab-active' : ''), () => {
              s.tab = key;
              s.message = '';
              rerender();
            });
            tab.setAttribute('aria-pressed', String(active));
            tab.setAttribute('aria-label', label);
            tab.append(
              el('span', { className: 'optional-studio-tab-index workbench-tab-number',
                attrs: { 'aria-hidden': 'true' },
                text: String(index + 1).padStart(2, '0') }),
              el('span', { className: 'optional-studio-tab-text workbench-tab-label', children: [
                el('strong', { text: label }),
                el('small', { text: {
                  preview: 'Leitura local',
                  compare: 'Mudanças no livro',
                  metadata: 'Dados da obra',
                }[key] }),
              ] }),
            );
            return tab;
          }) }),
        el('div', { className: 'workbench-stage', children: [
          s.tab === 'preview' ? renderPreview(state, s, rerender, enqueue) : undefined,
          s.tab === 'compare' ? renderCompare(state, s, rerender, enqueue) : undefined,
          s.tab === 'metadata' ? renderMetadata(state, s, rerender, enqueue) : undefined,
          s.message ? el('p', { className: 'optional-studio-message',
            attrs: { role: 'status' }, text: s.message }) : undefined,
        ] }),
      ] }),
    ],
  });
  details.open = s.expanded;
  details.addEventListener('toggle', () => {
    if (!details.isConnected) return;
    s.expanded = details.open;
    const label = details.querySelector<HTMLElement>('.workbench-disclosure-label');
    if (label) label.textContent = details.open ? 'Recolher' : 'Explorar';
  });
  return details;
}
