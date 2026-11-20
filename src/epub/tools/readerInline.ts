import { readerStyleMarks, type ReaderPresentation } from './readerPresentation';

export type InlineMark = 'strong' | 'emphasis' | 'code' | 'sup' | 'sub';

export interface InlineNoteReference {
  id: string;
  path?: string | undefined;
}

export interface InlineRun {
  text: string;
  marks: InlineMark[];
  hrefId?: string | undefined;
  hrefPath?: string | undefined;
}

const IGNORE = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'noscript', 'svg',
  'form', 'audio', 'video', 'canvas', 'math', 'template', 'img', 'image',
]);
const MAX_CHARACTERS = 20_000;
const MAX_RUNS = 1_000;
const MAX_DEPTH = 40;

function markOf(tag: string): InlineMark | undefined {
  if (tag === 'strong' || tag === 'b') return 'strong';
  if (tag === 'em' || tag === 'i' || tag === 'cite') return 'emphasis';
  if (tag === 'code' || tag === 'kbd' || tag === 'samp') return 'code';
  if (tag === 'sup') return 'sup';
  if (tag === 'sub') return 'sub';
  return undefined;
}

export function inlineRunsOf(
  element: Element, resolver?: (node: Element) => ReaderPresentation,
  linkResolver?: (href: string) => InlineNoteReference | undefined,
): InlineRun[] {
  const runs: InlineRun[] = [];
  let characters = 0;
  const append = (raw: string, marks: InlineMark[], hrefId?: string, hrefPath?: string): void => {
    const normalized = raw === '\n' ? '\n' : raw.replace(/[\t\r\n ]+/gu, ' ');
    const text = normalized.slice(0, Math.max(0, MAX_CHARACTERS - characters));
    if (!text || runs.length >= MAX_RUNS) return;
    const previous = runs[runs.length - 1];
    if (previous && previous.marks.join('|') === marks.join('|') &&
      previous.hrefId === hrefId && previous.hrefPath === hrefPath &&
      previous.text.length + text.length <= 4_000) {
      previous.text += text;
    } else {
      runs.push({ text, marks: [...marks], ...(hrefId ? { hrefId } : {}),
        ...(hrefPath ? { hrefPath } : {}) });
    }
    characters += text.length;
  };
  const visit = (node: Node, marks: InlineMark[], depth: number,
    hrefId?: string, hrefPath?: string): void => {
    if (characters >= MAX_CHARACTERS || runs.length >= MAX_RUNS || depth > MAX_DEPTH) return;
    if (node.nodeType === 3) {
      append(node.nodeValue ?? '', marks, hrefId, hrefPath);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = (node as Element).localName.toLowerCase();
    if (IGNORE.has(tag)) return;
    if (tag === 'br') {
      append('\n', marks, hrefId, hrefPath);
      return;
    }
    const mark = markOf(tag);
    const cssMarks = readerStyleMarks(node as Element, resolver);
    const next = [...marks];
    if (mark && !next.includes(mark)) next.push(mark);
    for (const styleMark of cssMarks) {
      if (!next.includes(styleMark)) next.push(styleMark);
    }
    const ref = tag === 'a' ? (node as Element).getAttribute('href') : undefined;
    const directId = ref?.startsWith('#') && /^[\w.:-]{1,90}$/u.test(ref.slice(1))
      ? ref.slice(1) : undefined;
    const target = ref && linkResolver ? linkResolver(ref) : undefined;
    for (const child of Array.from(node.childNodes)) {
      visit(child, next, depth + 1, target?.id ?? directId ?? hrefId,
        target?.path ?? hrefPath);
    }
  };
  const rootMarks = readerStyleMarks(element, resolver);
  for (const child of Array.from(element.childNodes)) visit(child, rootMarks, 0);
  while (runs[0]?.text.startsWith(' ')) {
    runs[0].text = runs[0].text.trimStart();
    if (!runs[0].text) runs.shift();
  }
  const last = runs[runs.length - 1];
  if (last) last.text = last.text.trimEnd();
  return runs.filter((run) => run.text.length > 0);
}
