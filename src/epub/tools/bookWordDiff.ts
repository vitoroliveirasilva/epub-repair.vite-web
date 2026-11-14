export type DiffKind = 'same' | 'added' | 'removed';

export interface WordDiffSegment {
  kind: DiffKind;
  text: string;
}

export interface WordDiffResult {
  before: WordDiffSegment[];
  after: WordDiffSegment[];
  addedWords: number;
  removedWords: number;
  truncated: boolean;
}

const MAX_WORDS_PER_SIDE = 550;
const CONTEXT_WORDS = 22;
const WORD_LIMIT = 35_000;

function wordsOf(text: string): string[] {
  return (text.match(/\S+/gu) ?? []).slice(0, WORD_LIMIT);
}

function addSegment(
  entries: WordDiffSegment[], kind: DiffKind, text: string,
): void {
  if (!text) return;
  const last = entries[entries.length - 1];
  if (last?.kind === kind && last.text.length + text.length < 4000) {
    last.text += ' ' + text;
  } else {
    entries.push({ kind, text });
  }
}

function compress(
  output: Array<{ kind: DiffKind; token: string }>, before: boolean,
): WordDiffSegment[] {
  const segments: WordDiffSegment[] = [];
  for (const token of output) {
    if (before && token.kind === 'added') continue;
    if (!before && token.kind === 'removed') continue;
    addSegment(segments, token.kind, token.token);
  }
  return segments;
}

function changedRegion(a: string[], b: string[]): {
  tokens: Array<{ kind: DiffKind; token: string }>;
  added: number;
  removed: number;
} {
  const width = b.length + 1;
  const table = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const here = i * width + j;
      table[here] = a[i] === b[j]
        ? 1 + table[(i + 1) * width + j + 1]!
        : Math.max(table[(i + 1) * width + j]!, table[here + 1]!);
    }
  }
  const tokens: Array<{ kind: DiffKind; token: string }> = [];
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      tokens.push({ kind: 'same', token: a[i]! });
      i += 1;
      j += 1;
    } else if (j < b.length && (i === a.length ||
      table[i * width + j + 1]! >= table[(i + 1) * width + j]!)) {
      tokens.push({ kind: 'added', token: b[j]! });
      j += 1;
      added += 1;
    } else {
      tokens.push({ kind: 'removed', token: a[i]! });
      i += 1;
      removed += 1;
    }
  }
  return { tokens, added, removed };
}

export function compareWords(original: string, revised: string): WordDiffResult {
  const a = wordsOf(original);
  const b = wordsOf(revised);
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix &&
    a[a.length - suffix - 1] === b[b.length - suffix - 1]) suffix += 1;
  const beforeMiddle = a.slice(prefix, a.length - suffix);
  const afterMiddle = b.slice(prefix, b.length - suffix);
  const truncated = beforeMiddle.length > MAX_WORDS_PER_SIDE ||
    afterMiddle.length > MAX_WORDS_PER_SIDE ||
    (original.match(/\S+/gu) ?? []).length !== a.length ||
    (revised.match(/\S+/gu) ?? []).length !== b.length;
  const difference = changedRegion(beforeMiddle.slice(0, MAX_WORDS_PER_SIDE),
    afterMiddle.slice(0, MAX_WORDS_PER_SIDE));
  const commonPrefix = a.slice(Math.max(0, prefix - CONTEXT_WORDS), prefix);
  const commonSuffix = suffix
    ? a.slice(a.length - suffix, a.length - suffix + CONTEXT_WORDS) : [];
  const output: Array<{ kind: DiffKind; token: string }> = [];
  if (prefix > CONTEXT_WORDS) output.push({ kind: 'same', token: '…' });
  for (const token of commonPrefix) output.push({ kind: 'same', token });
  output.push(...difference.tokens);
  if (truncated) output.push({ kind: 'same', token: '[trecho restante omitido]' });
  for (const token of commonSuffix) output.push({ kind: 'same', token });
  if (suffix > CONTEXT_WORDS) output.push({ kind: 'same', token: '…' });
  return {
    before: compress(output, true),
    after: compress(output, false),
    addedWords: difference.added,
    removedWords: difference.removed,
    truncated,
  };
}
