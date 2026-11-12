import type { BookPreview, BookSection } from './bookTools';

export interface BookDifference {
  label: string;
  before?: BookSection | undefined;
  after?: BookSection | undefined;
  status: 'same' | 'text-changed' | 'images-changed' | 'added' | 'removed';
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
  return (section.blocks ?? []).filter((block) => block.kind === 'image')
    .map((block) => block.imagePath + ':' + block.imageDataUrl);
}

function comparePair(before: BookSection | undefined, after: BookSection | undefined,
  approximate: boolean): BookDifference {
  const label = after?.title ?? before?.title ?? 'Seção';
  if (!before) return { label, before, after, status: 'added', approximate,
    ...wordCounts('', after?.text ?? '') };
  if (!after) return { label, before, after, status: 'removed', approximate,
    ...wordCounts(before.text, '') };
  const changed = wordChanges(before.text, after.text);
  const imagesChanged = imagesOf(before).join('\u0000') !== imagesOf(after).join('\u0000');
  return {
    label, before, after, approximate,
    status: before.text !== after.text ? 'text-changed'
      : imagesChanged ? 'images-changed' : 'same',
    addedWords: changed.added, removedWords: changed.removed,
  };
}

function wordCounts(before: string, after: string): { addedWords: number; removedWords: number } {
  const { added, removed } = wordChanges(before, after);
  return { addedWords: added, removedWords: removed };
}

export function compareBookPreviews(before: BookPreview, after: BookPreview): BookDifference[] {
  const used = new Set<number>();
  const rows: BookDifference[] = [];
  for (const [position, section] of after.sections.entries()) {
    const exact = before.sections.findIndex((candidate, index) =>
      !used.has(index) && candidate.path === section.path);
    const fallback = before.sections.findIndex((candidate, index) =>
      !used.has(index) && index === position &&
      candidate.title.toLocaleLowerCase() === section.title.toLocaleLowerCase());
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
  const changed = rows.filter((row) => row.status === 'text-changed' || row.status === 'images-changed').length;
  const added = rows.filter((row) => row.status === 'added').length;
  const removed = rows.filter((row) => row.status === 'removed').length;
  return `${unchanged} sem diferenças detectadas · ${changed} alterada(s) · ${added} nova(s) · ${removed} removida(s)`;
}
