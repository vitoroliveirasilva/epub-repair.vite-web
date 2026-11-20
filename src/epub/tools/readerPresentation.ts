import type { LoadedEpub } from '../model/epubTypes';
import { resolveReference } from '../utils/pathUtils';

export interface ReaderPresentation {
  align?: 'left' | 'right' | 'center' | 'justify' | undefined;
  indentEm?: number | undefined;
  fontSizeEm?: number | undefined;
  fontFamily?: 'serif' | 'sans-serif' | 'monospace' | undefined;
  weight?: 'normal' | 'bold' | undefined;
  italic?: boolean | undefined;
  lineHeight?: number | undefined;
  beforeEm?: number | undefined;
  afterEm?: number | undefined;
}

type Selector = { tag?: string; cls?: string; id?: string };
type Rule = { selector: Selector; declaration: ReaderPresentation; specificity: number };
const MAX_CSS_BYTES = 180_000;
const MAX_CSS_RULES = 120;
const MAX_CSS_FILES = 5;
const SELECTOR = /^(?:(?<tag>p|h[1-6]|li|blockquote|pre|figcaption|caption|th|td|body))?(?:(?:\.(?<cls>[a-z_][\w-]{0,79}))|(?:#(?<id>[a-z_][\w-]{0,79})))?$/iu;

function numericEm(input: string, min: number, max: number): number | undefined {
  const match = /^(-?\d+(?:\.\d+)?)(em|%)$/iu.exec(input.trim());
  if (!match) return undefined;
  const n = Number(match[1]) * (match[2]?.toLowerCase() === '%' ? 0.01 : 1);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : undefined;
}

function declarations(input: string): ReaderPresentation {
  const value: ReaderPresentation = {};
  for (const pair of input.split(';').slice(0, 45)) {
    const colon = pair.indexOf(':');
    if (colon < 1) continue;
    const property = pair.slice(0, colon).trim().toLowerCase();
    const raw = pair.slice(colon + 1).trim().toLowerCase();
    if (!raw || /[{}\\]|\b(?:url|expression|var|attr|import)\s*\(/iu.test(raw)) continue;
    if (property === 'text-align' && ['left', 'right', 'center', 'justify'].includes(raw)) {
      value.align = raw as ReaderPresentation['align'];
    } else if (property === 'text-indent') {
      const safe = numericEm(raw, 0, 4);
      if (safe !== undefined) value.indentEm = safe;
    } else if (property === 'font-size') {
      const safe = numericEm(raw, 0.7, 1.8);
      if (safe !== undefined) value.fontSizeEm = safe;
    } else if (property === 'font-family') {
      if (/monospace/iu.test(raw)) value.fontFamily = 'monospace';
      else if (/sans-serif/iu.test(raw)) value.fontFamily = 'sans-serif';
      else if (/\bserif\b/iu.test(raw)) value.fontFamily = 'serif';
    } else if (property === 'font-weight') {
      if (raw === 'bold' || raw === 'bolder' || /^[6-9]00$/u.test(raw)) value.weight = 'bold';
      else if (raw === 'normal' || raw === 'lighter' || /^[1-5]00$/u.test(raw)) value.weight = 'normal';
    } else if (property === 'font-style' && ['normal', 'italic', 'oblique'].includes(raw)) {
      value.italic = raw !== 'normal';
    } else if (property === 'line-height') {
      const num = Number(raw);
      if (Number.isFinite(num) && num >= 1 && num <= 2.5) value.lineHeight = num;
    } else if (property === 'margin-top') {
      const safe = numericEm(raw, 0, 3);
      if (safe !== undefined) value.beforeEm = safe;
    } else if (property === 'margin-bottom') {
      const safe = numericEm(raw, 0, 3);
      if (safe !== undefined) value.afterEm = safe;
    }
  }
  return value;
}

function parseSelector(value: string): Selector | undefined {
  const match = SELECTOR.exec(value.trim());
  if (!match || !(match.groups?.tag || match.groups?.cls || match.groups?.id)) return undefined;
  return {
    ...(match.groups?.tag ? { tag: match.groups.tag.toLowerCase() } : {}),
    ...(match.groups?.cls ? { cls: match.groups.cls } : {}),
    ...(match.groups?.id ? { id: match.groups.id } : {}),
  };
}

function matches(node: Element, selector: Selector): boolean {
  if (selector.tag && node.localName.toLowerCase() !== selector.tag) return false;
  if (selector.cls && !node.classList.contains(selector.cls)) return false;
  if (selector.id && node.getAttribute('id') !== selector.id) return false;
  return true;
}

function parseCss(source: string): Rule[] {
  const rules: Rule[] = [];
  const css = source.replace(/\/\*[\s\S]*?\*\//gu, '');
  const blocks = css.matchAll(/([^{}]+)\{([^{}]*)\}/gu);
  for (const block of blocks) {
    if (rules.length >= MAX_CSS_RULES) break;
    const declaration = declarations(block[2] ?? '');
    if (!Object.keys(declaration).length) continue;
    for (const selectorString of (block[1] ?? '').split(',').slice(0, 8)) {
      const selector = parseSelector(selectorString);
      if (!selector) continue;
      const specificity = selector.id ? 100 : selector.cls ? 10 : 1;
      rules.push({ selector, declaration, specificity });
      if (rules.length >= MAX_CSS_RULES) break;
    }
  }
  return rules;
}

export function readerPresentationRules(
  xml: Document, filePath: string, loaded: LoadedEpub,
): (node: Element) => ReaderPresentation {
  const rules: Rule[] = [];
  let used = 0;
  let files = 0;
  for (const node of Array.from(xml.getElementsByTagName('*')).slice(0, 8000)) {
    const tag = node.localName.toLowerCase();
    if (tag === 'style') {
      const source = node.textContent ?? '';
      if (source.length + used > MAX_CSS_BYTES) continue;
      used += source.length;
      rules.push(...parseCss(source));
    } else if (tag === 'link' && files < MAX_CSS_FILES &&
      (node.getAttribute('rel') ?? '').toLowerCase().split(/\s+/u).includes('stylesheet')) {
      const href = node.getAttribute('href') ?? '';
      if (!href || /^[a-z][a-z0-9+.-]*:|^\/\//iu.test(href)) continue;
      const resolved = resolveReference(filePath, href);
      if (!resolved.safe) continue;
      const source = loaded.files.get(resolved.path);
      if (!source || source.directory || source.bytes.length + used > MAX_CSS_BYTES) continue;
      used += source.bytes.length;
      files += 1;
      rules.push(...parseCss(new TextDecoder('utf-8').decode(source.bytes)));
    }
    if (rules.length >= MAX_CSS_RULES) break;
  }
  const ordered = rules.slice(0, MAX_CSS_RULES)
    .sort((a, b) => a.specificity - b.specificity);
  return (node: Element): ReaderPresentation => {
    const style: ReaderPresentation = {};
    if (node.parentElement && node !== xml.documentElement) {
      const body = node.ownerDocument.getElementsByTagName('body')[0];
      if (body && node !== body) {
        for (const rule of ordered) {
          if (rule.selector.tag === 'body' && !rule.selector.id && !rule.selector.cls) {
            if (rule.declaration.fontFamily) style.fontFamily = rule.declaration.fontFamily;
          }
        }
      }
    }
    for (const rule of ordered) {
      if (matches(node, rule.selector)) Object.assign(style, rule.declaration);
    }
    Object.assign(style, declarations(node.getAttribute('style') ?? ''));
    return style;
  };
}

export function readerStyleMarks(
  node: Element, resolver?: ((node: Element) => ReaderPresentation),
): Array<'strong' | 'emphasis'> {
  if (!resolver) return [];
  const presentation = resolver(node);
  return [
    ...(presentation.weight === 'bold' ? ['strong' as const] : []),
    ...(presentation.italic ? ['emphasis' as const] : []),
  ];
}
