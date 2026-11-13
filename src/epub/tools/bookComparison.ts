import type { BookPreview, BookSection } from './bookTools';
import type { BookBlock } from './bookReader';

export type DifferenceStatus =
  'same' | 'text-changed' | 'images-changed' | 'structure-changed' |
  'format-changed' | 'style-changed' | 'added' | 'removed';
export type DifferenceAspect = 'text' | 'images' | 'structure' | 'format' | 'styles';

export interface BookDifference {
  label: string;
  before?: BookSection | undefined;
  after?: BookSection | undefined;
  status: DifferenceStatus;
  aspects: DifferenceAspect[];
  approximate: boolean;
  addedWords: number;
  removedWords: number;
}

function wordChanges(before: string, after: string): { added: number; removed: number } {
  const a = before.split(/\s+/u).filter(Boolean);
  const b = after.split(/\s+/u).filter(Boolean);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let aEnd = a.length;
  let bEnd = b.length;
  while (aEnd > start && bEnd > start && a[aEnd - 1] === b[bEnd - 1]) {
    aEnd -= 1;
    bEnd -= 1;
  }
  return { added: bEnd - start, removed: aEnd - start };
}

function imagesOf(section: BookSection): string[] {
  return (section.blocks ?? []).flatMap((block) => {
    if (block.kind === 'image') {
      return [(block.imagePath ?? '') + ':' + (block.imageDataUrl ?? '') +
        ':' + block.text];
    }
    if (block.kind === 'table') {
      return block.table?.rows.flatMap((row) =>
        row.flatMap((cell) => (cell.images ?? []).map((image) =>
          image.imagePath + ':' + image.imageDataUrl + ':' + image.text))) ?? [];
    }
    return [];
  });
}

function imagesChanged(before: BookSection, after: BookSection): boolean {
  const a = imagesOf(before);
  const b = imagesOf(after);
  if (a.length !== b.length) return true;
  return a.some((image, index) => image !== b[index]);
}

function shapeOf(block: BookBlock): string {
  const table = block.table;
  return [
    block.kind, block.level ?? '', block.ordered ? 1 : 0,
    block.kind === 'table' && table
      ? table.rows.map((row) => row.map((cell) =>
        (cell.heading ? 'h' : 'd') + cell.colspan + 'x' + cell.rowspan).join(',')).join(';')
      : '',
    block.kind === 'footnote' ? block.noteId ?? '' : '',
  ].join('|');
}

function structureOf(section: BookSection): string {
  return (section.blocks ?? []).map(shapeOf).join('\n');
}

function marksOf(section: BookSection): string {
  return (section.blocks ?? []).map((block) => {
    const own = (block.runs ?? []).map((run) =>
      run.text + ':' + run.marks.join(',')).join('|');
    const cells = block.table?.rows.map((row) => row.map((cell) =>
      cell.runs.map((run) => run.text + ':' + run.marks.join(',')).join('|')).join(';')).join('\n')
      ?? '';
    return own + '/' + cells;
  }).join('\n');
}

function comparePair(
  before: BookSection | undefined, after: BookSection | undefined,
  approximate: boolean,
): BookDifference {
  const label = after?.title ?? before?.title ?? 'Seção';
  if (!before || !after) {
    const changed = wordChanges(before?.text ?? '', after?.text ?? '');
    return {
      label, before, after, approximate, aspects: [],
      status: before ? 'removed' : 'added',
      addedWords: changed.added, removedWords: changed.removed,
    };
  }
  const words = wordChanges(before.text, after.text);
  const aspects: DifferenceAspect[] = [];
  if (before.text !== after.text) aspects.push('text');
  if (imagesChanged(before, after)) aspects.push('images');
  if (before.blocks && after.blocks && structureOf(before) !== structureOf(after)) {
    aspects.push('structure');
  }
  if (before.blocks && after.blocks && marksOf(before) !== marksOf(after)) {
    aspects.push('format');
  }
  if (before.styleFingerprint !== undefined && after.styleFingerprint !== undefined &&
    before.styleFingerprint !== after.styleFingerprint) aspects.push('styles');
  const status: DifferenceStatus = aspects.includes('text') ? 'text-changed'
    : aspects.includes('images') ? 'images-changed'
      : aspects.includes('structure') ? 'structure-changed'
        : aspects.includes('styles') ? 'style-changed'
          : aspects.includes('format') ? 'format-changed' : 'same';
  return {
    label, before, after, approximate, status, aspects,
    addedWords: words.added, removedWords: words.removed,
  };
}

export function compareBookPreviews(before: BookPreview, after: BookPreview): BookDifference[] {
  const used = new Set<number>();
  const rows: BookDifference[] = [];
  for (const section of after.sections) {
    const exact = before.sections.findIndex((candidate, index) =>
      !used.has(index) && candidate.path === section.path);
    const normalizedTitle = section.title.trim().toLocaleLowerCase();
    const sameTitleInOriginal = before.sections
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate, index }) => !used.has(index) &&
        candidate.title.trim().toLocaleLowerCase() === normalizedTitle);
    const sameTitleInRevised = after.sections.filter((candidate) =>
      candidate.title.trim().toLocaleLowerCase() === normalizedTitle);
    const fallback = normalizedTitle && sameTitleInOriginal.length === 1 &&
      sameTitleInRevised.length === 1 ? sameTitleInOriginal[0]!.index : -1;
    const matched = exact >= 0 ? exact : fallback;
    if (matched >= 0) used.add(matched);
    rows.push(comparePair(matched >= 0 ? before.sections[matched] : undefined,
      section, exact < 0 && matched >= 0));
  }
  before.sections.forEach((section, index) => {
    if (!used.has(index)) rows.push(comparePair(section, undefined, false));
  });
  return rows;
}

export function comparisonSummary(rows: BookDifference[]): string {
  const unchanged = rows.filter((row) => row.status === 'same').length;
  const changed = rows.filter((row) => row.status !== 'same' &&
    row.status !== 'added' && row.status !== 'removed').length;
  const added = rows.filter((row) => row.status === 'added').length;
  const removed = rows.filter((row) => row.status === 'removed').length;
  return unchanged + ' sem diferenças detectadas · ' + changed +
    ' alterada(s) · ' + added + ' nova(s) · ' + removed + ' removida(s)';
}
