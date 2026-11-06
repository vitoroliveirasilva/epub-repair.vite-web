import type { ManifestItem, PackageDocumentInfo } from '../model/opfTypes';
import { isInvalidLanguageTag, normalizeLanguageTag } from '../utils/kindleCompatibility';
import { basename, encodePathForXml, isRemoteUrl, relativePath, resolveReference } from '../utils/pathUtils';
import { childElementsByLocalName, escapeXml, parseXml } from '../utils/xmlUtils';

export function shouldCreateNav(pkg: PackageDocumentInfo): boolean {
  return pkg.version.startsWith('3') && (!pkg.navItem || !pkg.navItem.exists);
}

export function shouldCreateNcx(pkg: PackageDocumentInfo): boolean {
  return !pkg.version.startsWith('3') || Boolean(pkg.ncxItem && !pkg.ncxItem.exists);
}

export function buildNavDocument(
  pkg: PackageDocumentInfo,
  navPath: string,
  resources?: ReadonlyMap<string, { bytes: Uint8Array }>,
): string {
  const navDir = navPath.includes('/') ? navPath.slice(0, navPath.lastIndexOf('/')) : '';
  const spineItems = pkg.spine
    .map((item) => item.manifestItem)
    .filter((item): item is NonNullable<typeof item> =>
      Boolean(item?.exists && item.mediaType.includes('html')),
    );
  const entries =
    spineItems.length > 0
      ? spineItems
      : pkg.manifest.filter((item) => item.exists && item.mediaType.includes('html'));
  if (entries.length === 0) {
    throw new Error('Não é possível criar nav.xhtml sem um documento de leitura válido.');
  }
  // EPUB 3 pode ter NCX editorial com partes/capítulos aninhados, mesmo
  // quando o nav.xhtml foi apagado. Recuperar essa estrutura antes de recorrer
  // ao inventário linear do spine (que perderia os títulos e fragmentos).
  const preserved = recreateNavFromNcx(pkg, navDir, resources);
  const list = preserved ?? entries
    .map((item, index) => {
      const href = encodePathForXml(relativePath(navDir, item.resolvedPath));
      const label = editorialLabel(item, index, resources);
      return `      <li><a href="${href}">${escapeXml(label)}</a></li>`;
    })
    .join('\n');

  const language = pkg.metadata.language && !isInvalidLanguageTag(pkg.metadata.language)
    ? normalizeLanguageTag(pkg.metadata.language)
    : undefined;
  const languageAttrs = language
    ? ` lang="${escapeXml(language)}" xml:lang="${escapeXml(language)}"`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"${languageAttrs}>\n  <head>\n    <title>Navegação</title>\n  </head>\n  <body>\n    <nav epub:type="toc" id="toc">\n      <h1>Sumário</h1>\n      <ol>\n${list || '      <li><span>Início</span></li>'}\n      </ol>\n    </nav>\n  </body>\n</html>\n`;
}


/**
 * Recupera o sumário NCX editorial para criar nav.xhtml sem achatamento.
 * É deliberadamente fail-closed: um destino ausente, URL externa, falta de
 * rótulo ou NCX inválido leva ao fallback linear. Não faz guesses de títulos.
 */
export function recreateNavFromNcx(
  pkg: PackageDocumentInfo,
  navDir: string,
  resources?: ReadonlyMap<string, { bytes: Uint8Array }>,
): string | undefined {
  const ncx = pkg.ncxItem;
  const source = ncx?.exists ? resources?.get(ncx.resolvedPath)?.bytes : undefined;
  if (!ncx || !source || typeof DOMParser === 'undefined') return undefined;
  try {
    const doc = parseXml(new TextDecoder('utf-8', { fatal: true }).decode(source));
    if (doc.documentElement.localName !== 'ncx') return undefined;
    const root = Array.from(doc.documentElement.children)
      .find((node) => node.localName === 'navMap');
    if (!root) return undefined;
    const validPaths = new Set(pkg.manifest.filter((x) => x.exists)
      .map((x) => x.resolvedPath));
    let visited = 0;
    const item = (point: Element, depth: number): string => {
      visited++;
      if (visited > 2000 || depth > 24) throw new Error('NCX excessivamente profundo');
      const labelRoot = childElementsByLocalName(point, 'navLabel')[0];
      const label = childElementsByLocalName(labelRoot, 'text')[0]
        ?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
      if (!label || label.length > 1000) throw new Error('NCX sem rótulo editorial válido');
      const content = childElementsByLocalName(point, 'content')[0];
      const src = content?.getAttribute('src')?.trim() ?? '';
      let link: string;
      if (!src) {
        link = '<span>' + escapeXml(label) + '</span>';
      } else {
        if (isRemoteUrl(src) || src.startsWith('#')) {
          throw new Error('NCX com URL externa ou âncora não resolvida');
        }
        const physical = resolveReference(ncx.resolvedPath, src);
        if (!physical.safe || !validPaths.has(physical.path) ||
            !resources?.has(physical.path)) {
          throw new Error('NCX com destino não declarado ou não localizado');
        }
        const fragment = src.includes('#') ? '#' + src.split('#').slice(1).join('#') : '';
        const href = encodePathForXml(relativePath(navDir, physical.path)) + fragment;
        link = '<a href="' + escapeXml(href) + '">' + escapeXml(label) + '</a>';
      }
      const nested = childElementsByLocalName(point, 'navPoint');
      const descendants = nested.length
        ? '<ol>\n' + nested.map((child) => item(child, depth + 1)).join('\n') +
          '\n</ol>' : '';
      return '      <li>' + link + descendants + '</li>';
    };
    const top = childElementsByLocalName(root, 'navPoint');
    if (!top.length) return undefined;
    const output = top.map((point) => item(point, 0)).join('\n');
    return output || undefined;
  } catch {
    // A validação do EPUB reportará o NCX ruim; a geração não pode transformar
    // um arquivo suspeito em links ativos ou inventar hierarquia editorial.
    return undefined;
  }
}

export function buildNcxDocument(
  pkg: PackageDocumentInfo,
  ncxPath: string,
  resources?: ReadonlyMap<string, { bytes: Uint8Array }>,
): string {
  const title = pkg.metadata.title ?? 'Livro sem título';
  const identifier = pkg.metadata.identifier ?? 'epub-repair-id';
  const ncxDir = ncxPath.includes('/') ? ncxPath.slice(0, ncxPath.lastIndexOf('/')) : '';
  const entries = pkg.spine
    .map((item) => item.manifestItem)
    .filter((item): item is NonNullable<typeof item> =>
      Boolean(item?.exists && item.mediaType.includes('html')),
    );
  if (entries.length === 0) {
    throw new Error('Não é possível criar toc.ncx sem destino de leitura válido.');
  }
  const navPoints = entries
    .map((item, index) => {
      const label = editorialLabel(item, index, resources);
      const href = encodePathForXml(relativePath(ncxDir, item.resolvedPath));
      return `    <navPoint id="navPoint-${index + 1}" playOrder="${index + 1}">\n      <navLabel><text>${escapeXml(label)}</text></navLabel>\n      <content src="${href}"/>\n    </navPoint>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n  <head>\n    <meta name="dtb:uid" content="${escapeXml(identifier)}"/>\n    <meta name="dtb:depth" content="1"/>\n    <meta name="dtb:totalPageCount" content="0"/>\n    <meta name="dtb:maxPageNumber" content="0"/>\n  </head>\n  <docTitle><text>${escapeXml(title)}</text></docTitle>\n  <navMap>\n${navPoints || '    <navPoint id="navPoint-1" playOrder="1"><navLabel><text>Início</text></navLabel><content src=""/></navPoint>'}\n  </navMap>\n</ncx>\n`;
}

/** Extrai título de um heading real sem inventar tradução ou alterar a obra. */
function editorialLabel(
  item: ManifestItem,
  index: number,
  resources?: ReadonlyMap<string, { bytes: Uint8Array }>,
): string {
  const rawFilename = basename(item.href).replace(/\.(?:xhtml?|html?)$/iu, '');
  const readableFilename = rawFilename.replace(/[-_]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  const fallback = readableFilename || item.id || `Capítulo ${index + 1}`;
  const bytes = resources?.get(item.resolvedPath)?.bytes;
  if (!bytes || typeof DOMParser === 'undefined') return fallback;

  try {
    const source = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
      .replace(/&nbsp;/giu, '&#160;');
    const doc = new DOMParser().parseFromString(source, 'application/xhtml+xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return fallback;
    const body = Array.from(doc.getElementsByTagName('*'))
      .find((element) => element.localName === 'body');
    const headings = body ? Array.from(body.getElementsByTagName('*')) : [];
    const heading = headings.find((element) =>
      /^h[1-6]$/u.test(element.localName) && Boolean(element.textContent?.trim()),
    );
    const title = Array.from(doc.getElementsByTagName('*')).find((element) =>
      element.localName === 'title')?.textContent?.trim();
    const editorial = (heading?.textContent || title || '').replace(/\s+/gu, ' ').trim();
    return editorial && !/^(?:untitled|unknown|sem título)$/iu.test(editorial)
      ? editorial.slice(0, 180) : fallback;
  } catch {
    return fallback;
  }
}
