import JSZip from 'jszip';
import type { AppState, ProcessingProgress } from '../app/state';
import { canRepairReport, DEFAULT_REPAIR_OPTIONS, type ValidationReport } from '../epub';
import { repairEpub } from '../epub/repair/repairEpub';
import { inspectEpub } from '../epub/validation/validateEpub';
import { MAX_FILE_SIZE_BYTES } from '../epub/utils/constants';
import { button, downloadBlob, el, formatBytes } from './dom';
import {
  buildKindleChecks, readBookMetadata, readBookPreview, writeBookMetadata,
  type BookMetadata, type BookPreview,
} from '../epub/tools/bookTools';

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
  meta?: BookMetadata | undefined;
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
    current.meta = undefined;
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

function readerCard(section: { title: string; text: string; truncated?: boolean },
  fontSize: number, label: string): HTMLElement {
  const content = el('div', { className: 'optional-reader-body' });
  content.style.fontSize = fontSize + 'px';
  content.append(el('h4', { text: section.title }));
  for (const part of section.text.split(/\n\n+/u).slice(0, 500)) {
    content.append(el('p', { text: part }));
  }
  if (section.truncated) content.append(paragraph('Trecho reduzido para preservar a memória do navegador.'));
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
        ? 'Prévia de texto pronta. Nenhuma mídia, script ou estilo do livro foi executado.'
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
    const node = document.querySelector<HTMLElement>('.optional-reader-body');
    if (node) node.style.fontSize = s.fontSize + 'px';
  });
  const chapter = view?.sections[s.chapter] ?? view?.sections[0];
  return el('div', { className: 'optional-tool-content', children: [
    paragraph('Leitura de texto segura, sem scripts ou recursos externos do EPUB. Layout fixo, ilustrações e estilos complexos não são reproduzidos nesta prévia.'),
    control,
    view ? paragraph(`${view.sections.length} seção(ões) carregada(s)${view.omitted ? `, ${view.omitted} omitida(s)` : ''}.${view.fixedLayout ? ' Este livro usa layout fixo.' : ''}`) : undefined,
    view?.sections.length ? el('div', { className: 'optional-reader-controls', children: [
      sectionChooser(view.sections, s.chapter, (n) => { s.chapter = n; rerender(); }),
      el('label', { children: [el('span', { text: 'Fonte' }), scale] }),
    ] }) : undefined,
    chapter ? readerCard(chapter, s.fontSize, 'Prévia do capítulo') : undefined,
  ] });
}

function renderCompare(state: AppState, s: Session, rerender: () => void, enqueue: Queue): HTMLElement {
  const source = state.originalSource;
  const current = state.payload;
  const hasChanged = Boolean(source && (s.export || current?.bytes !== source.bytes));
  const run = toolButton('Comparar versões', hasChanged && !state.busy, () => {
    if (!source || !current) return;
    enqueue('Comparar EPUB original e atual', async ({ signal }) => {
      s.sourcePreview = await readBookPreview(source.fileName, source.bytes, signal);
      const after = s.export
        ? { name: s.export.name, bytes: s.export.bytes }
        : { name: current.file.name, bytes: current.bytes };
      s.editedPreview = await readBookPreview(after.name, after.bytes, signal);
      s.compareChapter = 0;
      s.message = 'Comparação textual pronta, sem alterar os arquivos.';
    });
  });
  const before = s.sourcePreview?.sections ?? [];
  const after = s.editedPreview?.sections ?? [];
  const chapterList = after.length ? after : before;
  const selected = Math.min(s.compareChapter, Math.max(0, chapterList.length - 1));
  const originalSection = before[selected];
  const newSection = after[selected];
  const status = originalSection && newSection &&
    originalSection.text === newSection.text ? 'Texto igual' : 'Texto diferente ou capítulo movido';
  return el('div', { className: 'optional-tool-content', children: [
    paragraph('Compare o texto original e a cópia reparada ou editada. A comparação visual é simplificada; não representa diferenças de CSS, paginação e imagens.'),
    run,
    !hasChanged ? paragraph('Depois de reparar ou editar metadados, a comparação ficará disponível aqui.') : undefined,
    chapterList.length ? sectionChooser(chapterList, selected, (n) => { s.compareChapter = n; rerender(); }) : undefined,
    chapterList.length ? el('strong', { text: status }) : undefined,
    chapterList.length ? el('div', { className: 'optional-compare-grid', children: [
      readerCard(originalSection ?? { title: 'Não encontrado', text: 'Sem seção equivalente no índice.' },
        s.fontSize, 'Original'),
      readerCard(newSection ?? { title: 'Não encontrado', text: 'Sem seção equivalente no índice.' },
        s.fontSize, 'Atual'),
    ] }) : undefined,
  ] });
}

const FIELDS: Array<[keyof BookMetadata, string]> = [
  ['title', 'Título'], ['creator', 'Autor principal'], ['language', 'Idioma (pt-BR)'],
  ['identifier', 'Identificador principal'], ['publisher', 'Editora'], ['date', 'Data de publicação'],
  ['description', 'Descrição'], ['subject', 'Assunto'], ['series', 'Série'],
  ['seriesIndex', 'Volume da série'],
];

function renderMetadata(state: AppState, s: Session, enqueue: Queue): HTMLElement {
  const load = toolButton('Carregar metadados', Boolean(state.payload) && !state.busy, () => {
    const payload = state.payload;
    if (!payload) return;
    enqueue('Ler metadados EPUB', async ({ signal }) => {
      s.meta = await readBookMetadata(payload.file.name, payload.bytes, signal);
      s.message = 'Metadados carregados. Campos vazios não serão removidos ou alterados.';
    });
  });
  const fields = new Map<keyof BookMetadata, HTMLInputElement | HTMLTextAreaElement>();
  const inputs = s.meta ? FIELDS.map(([key, title]) => {
    const input = key === 'description'
      ? el('textarea', { attrs: { rows: '3', maxlength: '6000' }, text: s.meta?.[key] ?? '' })
      : el('input', { attrs: { type: 'text', value: s.meta?.[key] ?? '',
        maxlength: '300', autocomplete: 'off' } });
    fields.set(key, input);
    return el('label', { className: 'converter-field', children: [el('span', { text: title }), input] });
  }) : [];
  const save = toolButton('Gerar EPUB com metadados', Boolean(s.meta) && !state.busy, () => {
    const payload = state.payload;
    if (!payload) return;
    const changes: Partial<BookMetadata> = {};
    for (const [key, input] of fields) changes[key] = input.value;
    if (!window.confirm('Criar uma nova cópia com os metadados informados? O EPUB atual não será substituído.')) return;
    enqueue('Atualizar metadados EPUB', async ({ signal }) => {
      const result = await writeBookMetadata(payload.file.name, payload.bytes, changes, signal);
      s.export = { blob: result.blob, name: result.fileName,
        bytes: new Uint8Array(await result.blob.arrayBuffer()), report: result.report };
      s.sourcePreview = undefined;
      s.editedPreview = undefined;
      s.message = 'Nova cópia com metadados pronta para baixar. O arquivo de origem foi preservado.';
    });
  });
  return el('div', { className: 'optional-tool-content', children: [
    paragraph('Edite somente quando precisar. Não apagamos informações existentes ao deixar um campo vazio. Assinaturas digitais impedem a edição para evitar invalidá-las.'),
    load,
    s.meta ? el('div', { className: 'optional-metadata-grid', children: inputs }) : undefined,
    s.meta ? save : undefined,
    s.export ? button('Baixar EPUB com metadados', 'btn btn-primary btn-small', () =>
      downloadBlob(s.export!.blob, s.export!.name)) : undefined,
    s.export ? paragraph(`Cópia validada: ${s.export.report.stats.errorCount} erro(s) e ${s.export.report.stats.warningCount} aviso(s).`) : undefined,
  ] });
}

function renderKindle(state: AppState): HTMLElement {
  const report = state.report;
  const checks = report ? buildKindleChecks(report) : [];
  return el('div', { className: 'optional-tool-content', children: [
    paragraph('Conferência orientativa para o Send to Kindle. Não garante aprovação ou aparência idêntica no dispositivo. Nenhum arquivo é enviado automaticamente.'),
    ...checks.map((check) => el('div', { className: 'optional-check', children: [
      el('strong', { text: (check.ok ? '✓ ' : '! ') + check.label }),
      el('p', { className: 'muted', text: check.detail }),
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
      const zip = new JSZip();
      const used = new Set<string>();
      const status: string[] = [];
      for (const [index, file] of files.entries()) {
        if (signal.aborted) throw new DOMException('Lote cancelado.', 'AbortError');
        onProgress({ phase: `Lote: ${index + 1} de ${files.length} — ${file.name}`,
          completed: index, total: files.length });
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const report = await inspectEpub(file.name, bytes);
          if (!report.validZip || report.stats.fatalCount) {
            status.push(`${file.name}: recusado por problemas fatais`);
            continue;
          }
          let output: Blob = new Blob([bytes.slice().buffer],
            { type: 'application/epub+zip' });
          let name = file.name;
          if (canRepairReport(report)) {
            const result = await repairEpub(file.name, bytes, DEFAULT_REPAIR_OPTIONS,
              'repair', undefined, signal);
            if (result.changed && result.blob) {
              output = result.blob;
              name = result.fileName;
            }
          }
          const safeName = name.replace(/[^a-z0-9_.() -]/giu, '_').slice(0, 120);
          let filename = safeName;
          let duplicate = 1;
          while (used.has(filename)) filename = `${duplicate++}-${safeName}`;
          used.add(filename);
          zip.file(filename, output);
          status.push(`${file.name}: ${name === file.name ? 'validado' : 'reparado'}`);
        } catch (error) {
          if (signal.aborted) throw new DOMException('Lote cancelado.', 'AbortError');
          status.push(`${file.name}: falhou — ${error instanceof Error ? error.message : 'erro desconhecido'}`);
        }
      }
      if (signal.aborted) throw new DOMException('Lote cancelado.', 'AbortError');
      zip.file('resultado-lote.txt', status.join('\n'));
      const result = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE',
        compressionOptions: { level: 4 } });
      if (signal.aborted) throw new DOMException('Lote cancelado.', 'AbortError');
      s.batchZip = result;
      s.batchStatus = status;
      s.message = 'Lote concluído; confira os resultados individuais antes de baixar.';
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
      s.tab === 'metadata' ? renderMetadata(state, s, enqueue) : undefined,
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
