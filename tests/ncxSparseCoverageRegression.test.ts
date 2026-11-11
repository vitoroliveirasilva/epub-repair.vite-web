import { describe, expect, it } from 'vitest';
import type { ManifestItem, PackageDocumentInfo } from '../src/epub/model/opfTypes';
import { completeSparseNcx, inspectNcxCoverage } from '../src/epub/utils/ncxCoverage';
import { parseXml } from '../src/epub/utils/xmlUtils';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const ncx = '<?xml version="1.0" encoding="UTF-8"?>' +
  '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>' +
  '<navPoint id="cover" playOrder="1"><navLabel><text>Capa</text></navLabel>' +
  '<content src="Text/cover.xhtml"/></navPoint>' +
  '<navPoint id="ending" playOrder="2"><navLabel><text>Epílogo</text></navLabel>' +
  '<content src="Text/end.xhtml"/></navPoint></navMap></ncx>';

function fixture(): { pkg: PackageDocumentInfo; files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>([
    ['OPS/toc.ncx', bytes(ncx)],
    ['OPS/Text/cover.xhtml', bytes('<html><body>Capa</body></html>')],
    ['OPS/Text/025.html', bytes('<html><body><p>' + 'Conteúdo de teste. '.repeat(250) + '</p></body></html>')],
    ['OPS/Text/026.html', bytes('<html><body><p>' + 'Segundo trecho. '.repeat(250) + '</p></body></html>')],
    ['OPS/Text/end.xhtml', bytes('<html><body>Fim</body></html>')],
  ]);
  const paths = ['cover.xhtml', '025.html', '026.html', 'end.xhtml'];
  const manifest: ManifestItem[] = paths.map((name) => ({
    id: name, href: 'Text/' + name, mediaType: 'application/xhtml+xml',
    properties: [], resolvedPath: 'OPS/Text/' + name, pathSafe: true, exists: true,
  }));
  const ncxItem: ManifestItem = {
    id: 'ncx', href: 'toc.ncx', mediaType: 'application/x-dtbncx+xml',
    properties: [], resolvedPath: 'OPS/toc.ncx', pathSafe: true, exists: true,
  };
  return {
    files,
    pkg: {
      opfPath: 'OPS/content.opf', opfDir: 'OPS', version: '2.0',
      metadata: { title: 'Livro' }, manifest: [...manifest, ncxItem],
      spine: manifest.map((manifestItem) => ({ idref: manifestItem.id, manifestItem })),
      ncxItem, rootfileCount: 1,
    },
  };
}

describe('NCX parcial preserva a navegação editorial', () => {
  it('detecta documentos extensos sem entrada mesmo com NCX válido', () => {
    const { pkg, files } = fixture();
    const coverage = inspectNcxCoverage(pkg, (path) => files.get(path));
    expect(coverage.missing.map((entry) => entry.path)).toEqual([
      'OPS/Text/025.html', 'OPS/Text/026.html',
    ]);
    expect(coverage.safeToComplete).toBe(true);
  });

  it('insere links em ordem sem mudar XHTML e é idempotente', () => {
    const { pkg, files } = fixture();
    const contentBefore = files.get('OPS/Text/025.html')!.slice();
    expect(completeSparseNcx(files, pkg)).toHaveLength(1);
    const output = new TextDecoder().decode(files.get('OPS/toc.ncx'));
    const doc = parseXml(output);
    const points = Array.from(doc.getElementsByTagName('*')).filter((node) =>
      node.localName === 'navPoint');
    const targets = points.map((point) => Array.from(point.children)
      .find((element) => element.localName === 'content')?.getAttribute('src'));
    expect(targets).toEqual([
      'Text/cover.xhtml', 'Text/025.html', 'Text/026.html', 'Text/end.xhtml',
    ]);
    expect(points.map((point) => point.getAttribute('playOrder'))).toEqual(['1', '2', '3', '4']);
    expect(output).toContain('>Capa<');
    expect(output).toContain('>Epílogo<');
    expect(files.get('OPS/Text/025.html')).toEqual(contentBefore);
    expect(completeSparseNcx(files, pkg)).toEqual([]);
  });

  it('não altera índice hierárquico ou com fragmentos editoriais', () => {
    const { pkg, files } = fixture();
    const nested = ncx.replace('src="Text/cover.xhtml"', 'src="Text/cover.xhtml#inicio"');
    files.set('OPS/toc.ncx', bytes(nested));
    expect(inspectNcxCoverage(pkg, (path) => files.get(path)).safeToComplete).toBe(false);
    expect(completeSparseNcx(files, pkg)).toEqual([]);
    expect(new TextDecoder().decode(files.get('OPS/toc.ncx'))).toBe(nested);
  });
});
