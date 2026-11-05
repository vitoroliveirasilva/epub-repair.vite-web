import type { ManifestItem, PackageDocumentInfo } from '../model/opfTypes';
import { isInvalidLanguageTag, normalizeLanguageTag } from '../utils/kindleCompatibility';
import { basename, encodePathForXml, relativePath } from '../utils/pathUtils';
import { escapeXml } from '../utils/xmlUtils';

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
  const list = entries
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
