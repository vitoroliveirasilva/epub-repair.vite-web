export type InlineMark = 'strong' | 'emphasis' | 'code' | 'sup' | 'sub';

export interface InlineRun {
  text: string;
  marks: InlineMark[];
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

export function inlineRunsOf(element: Element): InlineRun[] {
  const runs: InlineRun[] = [];
  let characters = 0;
  const append = (raw: string, marks: InlineMark[]): void => {
    const normalized = raw === '\n' ? '\n' : raw.replace(/[\t\r\n ]+/gu, ' ');
    const text = normalized.slice(0, Math.max(0, MAX_CHARACTERS - characters));
    if (!text || runs.length >= MAX_RUNS) return;
    const previous = runs[runs.length - 1];
    if (previous && previous.marks.join('|') === marks.join('|') &&
      previous.text.length + text.length <= 4_000) {
      previous.text += text;
    } else {
      runs.push({ text, marks: [...marks] });
    }
    characters += text.length;
  };
  const visit = (node: Node, marks: InlineMark[], depth: number): void => {
    if (characters >= MAX_CHARACTERS || runs.length >= MAX_RUNS || depth > MAX_DEPTH) return;
    if (node.nodeType === 3) {
      append(node.nodeValue ?? '', marks);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = (node as Element).localName.toLowerCase();
    if (IGNORE.has(tag)) return;
    if (tag === 'br') {
      append('\n', marks);
      return;
    }
    const mark = markOf(tag);
    const next = mark && !marks.includes(mark) ? [...marks, mark] : marks;
    for (const child of Array.from(node.childNodes)) visit(child, next, depth + 1);
  };
  for (const child of Array.from(element.childNodes)) visit(child, [], 0);
  while (runs[0]?.text.startsWith(' ')) {
    runs[0].text = runs[0].text.trimStart();
    if (!runs[0].text) runs.shift();
  }
  const last = runs[runs.length - 1];
  if (last) last.text = last.text.trimEnd();
  return runs.filter((run) => run.text.length > 0);
}
