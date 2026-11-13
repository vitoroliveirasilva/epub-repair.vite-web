import type { AppState, ProcessingProgress } from '../app/state';
import type { ValidationReport } from '../epub';
import { MAX_FILE_SIZE_BYTES } from '../epub/utils/constants';
import { processEpubBatch, MAX_BATCH_BYTES, MAX_BATCH_FILES } from '../epub/tools/batchProcessor';
import { button, downloadBlob, el, formatBytes } from './dom';
import {
  buildKindleChecks, summarizeKindleChecks, readBookMetadata, readBookPreview, writeBookMetadata,
  type BookMetadata, type BookPreview, type BookSection,
} from '../epub/tools/bookTools';
import { compareBookPreviews, comparisonSummary, type BookDifference } from '../epub/tools/bookComparison';
import { compareWords, type WordDiffSegment } from '../epub/tools/bookWordDiff';
import type { InlineRun } from '../epub/tools/readerInline';
import type { ReaderPresentation } from '../epub/tools/readerPresentation';
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
  syncScroll: boolean;
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
      batchStatus: [], chapter: 0, compareChapter: 0, fontSize: 18,
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
  return el('div', { className: 'optional-tool-content', children: [
    paragraph('Prévia local segura: capítulos, imagens internas, tabelas e notas. Preserva uma seleção limitada de alinhamento, tipografia e espaçamento do CSS, sem executá-lo. A aparência em Kindle ou outros leitores pode diferir.'),
    control,
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
  return el('div', { className: 'optional-tool-content', children: [
    paragraph('Comparação editorial local: texto, organização, tabelas, notas, imagens e mudanças de estilo. Os dois painéis reproduzem apenas propriedades visuais seguras selecionadas. Não equivale a comparar pixels, fontes incorporadas ou a paginação de um Kindle.'),
    run,
    !hasChanged ? paragraph('Depois de reparar ou editar metadados, a comparação ficará disponível aqui.') : undefined,
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
    s.batchZip = undefined;
    s.batchStatus = [];
    if (files.length > MAX_BATCH_FILES || total > MAX_BATCH_BYTES || files.some((file) =>
      !file.name.toLowerCase().endsWith('.epub') ||
      file.size > MAX_FILE_SIZE_BYTES || file.size < 1)) {
      s.message = 'Escolha até 6 EPUBs válidos, com no máximo 80 MB somados.';
      s.batchFiles = [];
    } else {
      s.batchFiles = files;
      s.message = files.length + ' arquivo(s) selecionado(s).';
    }
    rerender();
  });
  const start = toolButton('Validar e reparar lote', s.batchFiles.length > 0 && !state.busy, () => {
    const files = [...s.batchFiles];
    s.batchStatus = files.map((file) => file.name + ': aguardando');
    s.batchZip = undefined;
    enqueue('Processar lote EPUB', async ({ signal, onProgress }) => {
      const processed = await processEpubBatch(files, signal,
        (phase, completed, total, detail) => {
          if (detail && detail.source !== 'ZIP final') {
            s.batchStatus[detail.index] = detail.source + ': ' + detail.detail;
          }
          onProgress({ phase, completed, total });
        });
      s.batchZip = processed.zip;
      s.batchStatus = processed.entries.map((entry) =>
        entry.source + ': ' + entry.status + ' (' + entry.detail + ')' +
        ' · Relatório: ' + entry.report);
      const available = processed.entries.filter((entry) => entry.output).length;
      s.message = 'Lote concluído: ' + available + '/' + files.length +
        ' EPUB(s) exportados. Consulte os relatórios individuais no ZIP.';
    });
  });
  return el('div', { className: 'optional-tool-content', children: [
    paragraph('Processamento local e sequencial de até 6 EPUBs e 80 MB. Cada livro recebe um relatório JSON individual, mesmo quando é recusado. O ZIP contém um resumo TXT/JSON. Arquivos problemáticos não bloqueiam os demais.'),
    input,
    s.batchFiles.length ? paragraph(s.batchFiles.map((f) => `${f.name} (${formatBytes(f.size)})`).join(' · ')) : undefined,
    start,
    s.batchStatus.length ? el('ol', { className: 'optional-batch-progress',
      attrs: { 'aria-label': 'Andamento de cada EPUB', 'aria-live': 'polite' },
      children: s.batchStatus.map((message) => el('li', { text: message })),
    }) : undefined,
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
