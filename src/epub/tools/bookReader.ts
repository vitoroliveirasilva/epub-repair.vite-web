import type { BookPreview, BookSection } from './bookTools';
import { loadEpub } from '../reader/loadEpub';
import { parsePackageDocument } from '../validation/opfParser';
import { resolveReference } from '../utils/pathUtils';
import { findFirstByLocalName, parseXml } from '../utils/xmlUtils';
import type { LoadedEpub } from '../model/epubTypes';
import { inlineRunsOf, type InlineRun } from './readerInline';

export interface BookBlock {
  kind: 'heading' | 'paragraph' | 'quotation' | 'list-item' | 'verse' | 'caption' | 'image';
  text: string;
  imageDataUrl?: string | undefined;
  imagePath?: string | undefined;
  runs?: InlineRun[] | undefined;
  level?: number | undefined;
}

const IMAGE_TYPES = new Map([
  ['image/jpeg', 'image/jpeg'],
  ['image/png', 'image/png'],
  ['image/gif', 'image/gif'],
  ['image/webp', 'image/webp'],
]);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BUDGET = 8 * 1024 * 1024;
const MAX_IMAGE_COUNT = 20;
const MAX_SECTIONS = 80;
const MAX_BLOCKS = 280;
const MAX_CHARS = 120_000;
const DISALLOWED = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'noscript', 'svg', 'form',
  'audio', 'video', 'canvas', 'math', 'template', 'head',
]);

function textClean(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function normalizeNamedEntities(text: string): string {
  const common: Record<string, string> = {
    nbsp: '&#160;', copy: '&#169;', reg: '&#174;', mdash: '&#8212;',
    ndash: '&#8211;', hellip: '&#8230;', bull: '&#8226;', rsquo: '&#8217;',
    lsquo: '&#8216;', rdquo: '&#8221;', ldquo: '&#8220;', trade: '&#8482;',
  };
  return text.replace(/&([a-z]+);/giu, (whole, name: string) =>
    common[name.toLowerCase()] ?? whole);
}

function isValidRaster(bytes: Uint8Array, type: string): boolean {
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (type === 'image/png') return bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (type === 'image/gif') return bytes.length >= 6 &&
    String.fromCharCode(...bytes.subarray(0, 3)) === 'GIF';
  if (type === 'image/webp') return bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
  return false;
}

function toBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let start = 0; start < bytes.length; start += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(start, start + 8192)));
  }
  return btoa(chunks.join(''));
}

function imageFromBook(
  src: string, filePath: string, loaded: LoadedEpub,
  imageManifest: Map<string, string>,
  budget: { bytes: number; count: number },
  cache: Map<string, string>,
): { dataUrl?: string; path?: string } {
  if (!src || /^[a-z][a-z0-9+.-]*:|^\/\//iu.test(src) || src.startsWith('#')) return {};
  const resolved = resolveReference(filePath, src);
  if (!resolved.safe) return {};
  const type = imageManifest.get(resolved.path);
  const entry = loaded.files.get(resolved.path);
  if (!type || !entry || entry.directory) return {};
  const previous = cache.get(resolved.path);
  if (previous) return { dataUrl: previous, path: resolved.path };
  if (entry.bytes.length > MAX_IMAGE_BYTES || entry.bytes.length > budget.bytes ||
      budget.count >= MAX_IMAGE_COUNT || !isValidRaster(entry.bytes, type)) return {};
  const encoded = 'data:' + type + ';base64,' + toBase64(entry.bytes);
  budget.bytes -= entry.bytes.length;
  budget.count += 1;
  cache.set(resolved.path, encoded);
  return { dataUrl: encoded, path: resolved.path };
}

function isInsideDisallowed(node: Element, body: Element): boolean {
  let ancestor: Element | null = node;
  while (ancestor && ancestor !== body) {
    if (DISALLOWED.has(ancestor.localName.toLowerCase())) return true;
    ancestor = ancestor.parentElement;
  }
  return false;
}

function isNestedTextBlock(node: Element, body: Element): boolean {
  let ancestor = node.parentElement;
  while (ancestor && ancestor !== body) {
    if (['p', 'li', 'blockquote', 'pre', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']
      .includes(ancestor.localName.toLowerCase())) return true;
    ancestor = ancestor.parentElement;
  }
  return false;
}

function blocksFromXhtml(
  source: string, filePath: string, loaded: LoadedEpub,
  imageManifest: Map<string, string>, budget: { bytes: number; count: number },
  cache: Map<string, string>,
): { title: string; blocks: BookBlock[]; text: string } {
  const xml = parseXml(normalizeNamedEntities(source));
  const body = findFirstByLocalName(xml, 'body') ?? xml.documentElement;
  for (const element of Array.from(body.getElementsByTagName('*'))) {
    if (DISALLOWED.has(element.localName.toLowerCase())) element.remove();
  }
  const title = findFirstByLocalName(body, 'h1')?.textContent?.trim() ||
    findFirstByLocalName(body, 'h2')?.textContent?.trim() ||
    findFirstByLocalName(xml, 'title')?.textContent?.trim() || '';
  const blocks: BookBlock[] = [];
  const all = Array.from(body.getElementsByTagName('*'));
  for (const node of all) {
    if (blocks.length >= MAX_BLOCKS) break;
    const tag = node.localName.toLowerCase();
    if (isInsideDisallowed(node, body)) continue;
    if (tag === 'img' || tag === 'image') {
      const ref = node.getAttribute('src') ?? node.getAttribute('href') ?? '';
      const img = imageFromBook(ref, filePath, loaded, imageManifest, budget, cache);
      if (img.dataUrl) blocks.push({
        kind: 'image', text: textClean(node.getAttribute('alt') ?? 'Imagem da obra'),
        imageDataUrl: img.dataUrl, imagePath: img.path,
      });
      continue;
    }
    if (!['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li',
      'blockquote', 'pre', 'figcaption'].includes(tag)) continue;
    if (isNestedTextBlock(node, body)) continue;
    const runs = inlineRunsOf(node);
    const text = textClean(runs.map((run) => run.text).join(''));
    if (!text) continue;
    const kind: BookBlock['kind'] = tag.startsWith('h') ? 'heading'
      : tag === 'li' ? 'list-item' : tag === 'blockquote' ? 'quotation'
        : tag === 'pre' ? 'verse' : tag === 'figcaption' ? 'caption' : 'paragraph';
    blocks.push({ kind, text: text.slice(0, 20000), runs,
      ...(kind === 'heading' ? { level: Number(tag.slice(1)) } : {}) });
  }
  const text = blocks.filter((item) => item.kind !== 'image').map((block) => block.text)
    .join('\n\n') || textClean(body.textContent ?? '');
  return { title: textClean(title), blocks, text };
}

function legacyFallback(source: string): { title: string; blocks: BookBlock[]; text: string } {
  const title = source.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/iu)?.[1]
    ?.replace(/<[^>]*>/gu, '').trim() ?? '';
  const text = source.replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/giu, ' ')
    .replace(/<[^>]*>/gu, ' ').replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&').replace(/\s+/gu, ' ').trim();
  return { title, text, blocks: [{ kind: 'paragraph', text: text.slice(0, MAX_CHARS) }] };
}

export async function readRichBookPreview(
  fileName: string, bytes: Uint8Array, signal?: AbortSignal,
): Promise<BookPreview> {
  const loaded = await loadEpub(fileName, bytes, undefined, signal);
  if (!loaded.validZip || loaded.issues.some((issue) => issue.severity === 'fatal')) {
    throw new Error('Não foi possível abrir o EPUB para leitura segura.');
  }
  const pkg = parsePackageDocument(loaded).packageInfo;
  if (!pkg) throw new Error('Este EPUB não possui um spine válido para leitura.');
  const items = pkg.spine.map((spine) => spine.manifestItem)
    .filter((item) => item && item.exists &&
      (item.mediaType === 'application/xhtml+xml' || item.mediaType === 'text/html'));
  const imageManifest = new Map(pkg.manifest
    .filter((item) => item.exists && IMAGE_TYPES.has(item.mediaType))
    .map((item) => [item.resolvedPath, IMAGE_TYPES.get(item.mediaType)!]));
  const budget = { bytes: MAX_IMAGE_BUDGET, count: 0 };
  const cache = new Map<string, string>();
  const sections: BookSection[] = [];
  for (const item of items.slice(0, MAX_SECTIONS)) {
    if (signal?.aborted) throw new DOMException('Leitura cancelada.', 'AbortError');
    if (!item) continue;
    const entry = loaded.files.get(item.resolvedPath);
    if (!entry || entry.bytes.length > 4_000_000) continue;
    const source = new TextDecoder('utf-8').decode(entry.bytes);
    let parsed: ReturnType<typeof blocksFromXhtml>;
    try {
      parsed = blocksFromXhtml(source, item.resolvedPath, loaded, imageManifest, budget, cache);
    } catch {
      parsed = legacyFallback(source);
    }
    sections.push({
      path: item.resolvedPath,
      title: (parsed.title || item.href.split('/').pop() || 'Seção').slice(0, 140),
      text: parsed.text.slice(0, MAX_CHARS),
      blocks: parsed.blocks,
      truncated: parsed.text.length > MAX_CHARS || parsed.blocks.length >= MAX_BLOCKS,
    });
  }
  const opf = loaded.files.get(pkg.opfPath);
  const fixedLayout = Boolean(opf && /pre-paginated/iu.test(new TextDecoder().decode(opf.bytes)));
  return {
    title: pkg.metadata.title || fileName,
    sections,
    omitted: Math.max(0, items.length - sections.length),
    fixedLayout,
  };
}
