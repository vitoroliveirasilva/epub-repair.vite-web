import { inlineRunsOf, type InlineRun } from './readerInline';

export interface ReaderCell {
  text: string;
  runs: InlineRun[];
  heading: boolean;
  colspan: number;
  rowspan: number;
}

export interface ReaderTable {
  caption: string;
  rows: ReaderCell[][];
  truncated: boolean;
}

export interface ReaderNote {
  id?: string | undefined;
  text: string;
  runs: InlineRun[];
}

const MAX_ROWS = 70;
const MAX_COLUMNS = 14;
const MAX_CELLS = 450;
const MAX_CELL_TEXT = 1800;
const MAX_NOTE_TEXT = 6000;
const MAX_CAPTION = 200;

function clean(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

function tableRows(table: Element): Element[] {
  return Array.from(table.getElementsByTagName('*'))
    .filter((node) => node.localName.toLowerCase() === 'tr' &&
      node.parentElement?.closest('table') === table);
}

function positiveSpan(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_COLUMNS
    ? parsed : 1;
}

export function readSafeTable(table: Element): ReaderTable {
  const rows: ReaderCell[][] = [];
  const candidates = tableRows(table);
  let cellsRead = 0;
  let truncated = candidates.length > MAX_ROWS;
  for (const row of candidates.slice(0, MAX_ROWS)) {
    const cells: ReaderCell[] = [];
    const children = Array.from(row.children).filter((node) =>
      (node.localName.toLowerCase() === 'th' || node.localName.toLowerCase() === 'td') &&
      node.closest('tr') === row);
    if (children.length > MAX_COLUMNS) truncated = true;
    for (const node of children.slice(0, MAX_COLUMNS)) {
      if (cellsRead >= MAX_CELLS) {
        truncated = true;
        break;
      }
      const runs = inlineRunsOf(node);
      const text = clean(runs.map((run) => run.text).join('')).slice(0, MAX_CELL_TEXT);
      if (clean(node.textContent ?? '').length > MAX_CELL_TEXT) truncated = true;
      cells.push({
        text, runs, heading: node.localName.toLowerCase() === 'th',
        colspan: positiveSpan(node.getAttribute('colspan')),
        rowspan: positiveSpan(node.getAttribute('rowspan')),
      });
      cellsRead += 1;
    }
    if (cells.length) rows.push(cells);
    if (cellsRead >= MAX_CELLS) break;
  }
  const captionNode = Array.from(table.children)
    .find((node) => node.localName.toLowerCase() === 'caption');
  return {
    caption: clean(captionNode?.textContent ?? '').slice(0, MAX_CAPTION),
    rows, truncated,
  };
}

export function readSafeNote(node: Element): ReaderNote {
  const runs = inlineRunsOf(node);
  const text = clean(runs.map((run) => run.text).join('')).slice(0, MAX_NOTE_TEXT);
  const original = clean(node.textContent ?? '');
  const id = node.getAttribute('id') ?? undefined;
  return {
    ...(id && /^[\w.:-]{1,90}$/u.test(id) ? { id } : {}),
    text: text || original.slice(0, MAX_NOTE_TEXT), runs,
  };
}

export function isFootnote(node: Element): boolean {
  const kind = (node.getAttribute('epub:type') ??
    node.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ??
    node.getAttribute('role') ?? '').toLowerCase();
  const tag = node.localName.toLowerCase();
  return kind.split(/\s+/u).some((value) => value === 'footnote' || value === 'doc-footnote' ||
    value === 'endnote' || value === 'doc-endnote') ||
    ((tag === 'aside' || tag === 'li') &&
      /\b(?:footnote|endnote)\b/iu.test(node.getAttribute('class') ?? ''));
}
