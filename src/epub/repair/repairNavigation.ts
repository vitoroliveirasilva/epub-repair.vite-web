import type { PackageDocumentInfo } from '../model/opfTypes';
import { basename, encodePathForXml, relativePath } from '../utils/pathUtils';
import { escapeXml } from '../utils/xmlUtils';

export function shouldCreateNav(pkg: PackageDocumentInfo): boolean {
  return pkg.version.startsWith('3') && (!pkg.navItem || !pkg.navItem.exists);
}

export function shouldCreateNcx(pkg: PackageDocumentInfo): boolean {
  return !pkg.version.startsWith('3') || Boolean(pkg.ncxItem && !pkg.ncxItem.exists);
}

export function buildNavDocument(pkg: PackageDocumentInfo, navPath: string): string {
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
  const list = entries
    .map((item, index) => {
      const href = encodePathForXml(relativePath(navDir, item.resolvedPath));
      const label = item.id || basename(item.href) || `Capítulo ${index + 1}`;
      return `      <li><a href="${href}">${escapeXml(label)}</a></li>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="pt-BR">\n  <head>\n    <title>Navegação</title>\n  </head>\n  <body>\n    <nav epub:type="toc" id="toc">\n      <h1>Sumário</h1>\n      <ol>\n${list || '      <li><span>Início</span></li>'}\n      </ol>\n    </nav>\n  </body>\n</html>\n`;
}

export function buildNcxDocument(pkg: PackageDocumentInfo): string {
  const title = pkg.metadata.title ?? 'Livro sem título';
  const identifier = pkg.metadata.identifier ?? 'epub-repair-id';
  const entries = pkg.spine
    .map((item) => item.manifestItem)
    .filter((item): item is NonNullable<typeof item> =>
      Boolean(item?.exists && item.mediaType.includes('html')),
    );
  const navPoints = entries
    .map((item, index) => {
      const label = item.id || basename(item.href) || `Capítulo ${index + 1}`;
      return `    <navPoint id="navPoint-${index + 1}" playOrder="${index + 1}">\n      <navLabel><text>${escapeXml(label)}</text></navLabel>\n      <content src="${encodePathForXml(item.href)}"/>\n    </navPoint>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n  <head>\n    <meta name="dtb:uid" content="${escapeXml(identifier)}"/>\n    <meta name="dtb:depth" content="1"/>\n    <meta name="dtb:totalPageCount" content="0"/>\n    <meta name="dtb:maxPageNumber" content="0"/>\n  </head>\n  <docTitle><text>${escapeXml(title)}</text></docTitle>\n  <navMap>\n${navPoints || '    <navPoint id="navPoint-1" playOrder="1"><navLabel><text>Início</text></navLabel><content src=""/></navPoint>'}\n  </navMap>\n</ncx>\n`;
}
