import type { PackageDocumentInfo } from '../model/opfTypes';
import { resolveReference } from '../utils/pathUtils';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';






export function coverSvgAccessibleLabel(
  svg: Element, document: Document, pagePath: string, pkg: PackageDocumentInfo,
): string | undefined {
  const coverPath = pkg.coverItem?.exists ? pkg.coverItem.resolvedPath : undefined;
  if (!coverPath || svg.namespaceURI !== SVG_NS || svg.localName !== 'svg') {
    return undefined;
  }
  if (svg.hasAttribute('aria-label') || svg.hasAttribute('aria-labelledby') ||
      svg.getAttribute('aria-hidden') === 'true' ||
      (svg.hasAttribute('role') && svg.getAttribute('role') !== 'img')) {
    return undefined;
  }
  
  
  if (svg.children.length !== 1) return undefined;
  const image = svg.children[0];
  if (!image || image.namespaceURI !== SVG_NS || image.localName !== 'image' ||
      image.children.length > 0) return undefined;
  const href = image.getAttributeNS(XLINK_NS, 'href') ??
    image.getAttribute('xlink:href') ?? image.getAttribute('href');
  if (!href) return undefined;
  const resolved = resolveReference(pagePath, href);
  if (!resolved.safe || resolved.path !== coverPath) return undefined;

  const head = Array.from(document.getElementsByTagName('*')).find(
    (element) => element.localName === 'head' &&
      element.namespaceURI === 'http://www.w3.org/1999/xhtml');
  const title = head && Array.from(head.children).find(
    (element) => element.localName === 'title')?.textContent?.trim();
  if (!title || title.length > 160) return undefined;

  
  
  const isCoverTitle = /^(?:cover|front cover|capa|capa do livro|couverture)$/iu.test(title);
  const markedCover = Boolean(head && Array.from(head.children).some(
    (element) => element.localName === 'meta' &&
      element.getAttribute('name') === 'calibre:cover' &&
      element.getAttribute('content')?.toLowerCase() === 'true'));
  return isCoverTitle || markedCover ? title : undefined;
}





export function labelSingleCoverSvg(
  source: string, document: Document, pagePath: string, pkg: PackageDocumentInfo,
): string {
  const svgList = Array.from(document.getElementsByTagNameNS(SVG_NS, 'svg'));
  if (svgList.length !== 1) return source;
  const svg = svgList[0]!;
  const label = coverSvgAccessibleLabel(svg, document, pagePath, pkg);
  if (!label) return source;

  const matches = Array.from(source.matchAll(/<svg(?=\s|>)([^<>]*?)>/giu));
  if (matches.length !== 1) return source;
  const tag = matches[0]![0];
  const safeLabel = label.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;')
    .replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
  const role = svg.hasAttribute('role') ? '' : ' role="img"';
  return source.replace(tag, tag.slice(0, -1) +
    role + ' aria-label="' + safeLabel + '">');
}
