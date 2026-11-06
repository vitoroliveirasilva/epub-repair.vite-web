import type { PackageDocumentInfo } from '../model/opfTypes';
import { HTML_MEDIA_TYPES, CSS_MEDIA_TYPES } from '../utils/constants';
import { basename, decodeCssEscapes, resolveFromDir, resolveReference } from '../utils/pathUtils';
import { decodeUtf8ForRewrite } from '../utils/textEncoding';
import { parseXml } from '../utils/xmlUtils';
import { extractCssResourceReferences } from '../validation/referenceExtractor';

function documentOf(path: string, files: ReadonlyMap<string, Uint8Array>): Document | undefined {
  const bytes = files.get(path);
  if (!bytes) return undefined;
  try { return parseXml(decodeUtf8ForRewrite(bytes, path), 'application/xhtml+xml'); }
  catch { return undefined; }
}
function isCoverType(node: Element): boolean {
  const type = node.getAttribute('epub:type') ??
    node.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ??
    node.getAttribute('type') ?? '';
  return type.toLowerCase().split(/\s+/u).includes('cover');
}
function linkedStyles(
  doc: Document, path: string, cssPaths: ReadonlySet<string>,
): Set<string> {
  const found = new Set<string>();
  for (const link of Array.from(doc.getElementsByTagName('*'))) {
    if (link.localName !== 'link' ||
        !(link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/u).includes('stylesheet')) continue;
    const href = link.getAttribute('href') ?? '';
    if (!href) continue;
    const target = resolveReference(path, href);
    if (target.safe && cssPaths.has(target.path)) found.add(target.path);
  }
  return found;
}

/**
 * Limites editoriais para uma troca de capa:
 * - guia/landmark/nome inequívoco;
 * - primeira página do spine sem prosa, usando a capa como única ilustração;
 * - CSS usado exclusivamente por páginas de capa.
 */
export function coverReferenceScope(
  opf: Document,
  pkg: PackageDocumentInfo,
  files: ReadonlyMap<string, Uint8Array>,
  oldCoverPath: string | undefined,
): { pages: Set<string>; allowed: Set<string>; sharedStyles: Set<string>;
     consumers: Map<string, Set<string>> } {
  const htmlPaths = new Set(pkg.manifest
    .filter((item) => item.exists && HTML_MEDIA_TYPES.has(item.mediaType))
    .map((item) => item.resolvedPath));
  const cssPaths = new Set(pkg.manifest
    .filter((item) => item.exists && CSS_MEDIA_TYPES.has(item.mediaType))
    .map((item) => item.resolvedPath));
  const pages = new Set<string>();
  const fromRef = (sourcePath: string, href: string): void => {
    const target = sourcePath === pkg.opfPath
      ? resolveFromDir(pkg.opfDir, href)
      : resolveReference(sourcePath, href);
    if (target.safe && htmlPaths.has(target.path)) pages.add(target.path);
  };
  for (const node of Array.from(opf.getElementsByTagName('*'))) {
    if (node.localName === 'reference' && node.parentElement?.localName === 'guide' &&
        isCoverType(node)) {
      const href = node.getAttribute('href');
      if (href) fromRef(pkg.opfPath, href);
    }
  }
  if (pkg.navItem?.exists) {
    const nav = documentOf(pkg.navItem.resolvedPath, files);
    if (nav) for (const node of Array.from(nav.getElementsByTagName('*'))) {
      if (node.localName !== 'a' || !isCoverType(node)) continue;
      const href = node.getAttribute('href');
      if (href) fromRef(pkg.navItem.resolvedPath, href);
    }
  }
  for (const path of htmlPaths) {
    if (/^(?:cover|capa|frontcover|titlepage)(?:[-_.][^/]*)?\.x?html?$/iu
      .test(basename(path))) pages.add(path);
  }
  const consumers = new Map<string, Set<string>>();
  // Um CSS importado é consumido indiretamente por cada página que usa a
  // folha importadora. Percorrer a árvore com proteção contra ciclos.
  const markUsage = (css: string, page: string, visited: Set<string>): void => {
    if (visited.has(css)) return;
    visited.add(css);
    const users = consumers.get(css) ?? new Set<string>();
    users.add(page);
    consumers.set(css, users);
    const bytes = files.get(css);
    if (!bytes) return;
    try {
      const source = decodeUtf8ForRewrite(bytes, css);
      for (const ref of extractCssResourceReferences(source)) {
        if (ref.attr !== 'css:import') continue;
        const imported = resolveReference(css, decodeCssEscapes(ref.raw));
        if (imported.safe && cssPaths.has(imported.path)) {
          markUsage(imported.path, page, visited);
        }
      }
    } catch {
      // Preservar um CSS legado ambíguo sem inferir seus imports.
    }
  };
  for (const path of htmlPaths) {
    const doc = documentOf(path, files);
    if (!doc) continue;
    for (const css of linkedStyles(doc, path, cssPaths)) {
      markUsage(css, path, new Set<string>());
    }
  }
  // EPUBs antigos frequentemente usam 0001.xhtml como página de capa.
  // A primeira página deve ser essencialmente visual e sem texto editorial.
  const first = pkg.spine[0]?.manifestItem?.resolvedPath;
  if (first && oldCoverPath && htmlPaths.has(first)) {
    const doc = documentOf(first, files);
    const body = doc && Array.from(doc.getElementsByTagName('*'))
      .find((el) => el.localName === 'body');
    const text = (body?.textContent ?? '').replace(/\s+/gu, ' ').trim();
    if (body && (!text || /^(?:cover|capa)$/iu.test(text))) {
      const images = Array.from(body.getElementsByTagName('*'))
        .filter((element) => element.localName === 'img' || element.localName === 'image');
      const hasDirectImage = images.some((node) => {
        const value = node.getAttribute('src') ?? node.getAttribute('href') ??
          node.getAttribute('xlink:href') ?? '';
        return value && resolveReference(first, value).path === oldCoverPath;
      });
      const hasInlineCssImage = Array.from(doc!.getElementsByTagName('*')).some((node) => {
        const styles = [
          ...(node.localName === 'style' ? [node.textContent ?? ''] : []),
          ...(node.hasAttribute('style') ? [node.getAttribute('style') ?? ''] : []),
        ];
        return styles.some((style) => extractCssResourceReferences(style).some((ref) =>
          ref.attr === 'css:url' &&
          resolveReference(first, decodeCssEscapes(ref.raw)).path === oldCoverPath));
      });
      const hasCssImage = hasInlineCssImage || [...(consumers.keys())].some((css) => {
        if (!consumers.get(css)?.has(first)) return false;
        const bytes = files.get(css);
        if (!bytes) return false;
        try {
          return extractCssResourceReferences(decodeUtf8ForRewrite(bytes, css))
            .some((ref) => ref.attr === 'css:url' &&
              resolveReference(css, decodeCssEscapes(ref.raw)).path === oldCoverPath);
        } catch { return false; }
      });
      if ((hasDirectImage && images.length === 1) || (hasCssImage && images.length === 0)) {
        pages.add(first);
      }
    }
  }
  const allowed = new Set(pages);
  const sharedStyles = new Set<string>();
  for (const [css, users] of consumers) {
    if (![...users].some((path) => pages.has(path))) continue;
    if ([...users].every((path) => pages.has(path))) allowed.add(css);
    else sharedStyles.add(css);
  }
  return { pages, allowed, sharedStyles, consumers };
}
