// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { validateNavigation } from '../src/epub/validation/validateNavigation';
import { validateInternalAnchors } from '../src/epub/validation/validateInternalAnchors';
import { validateKindleCompatibility } from '../src/epub/validation/validateKindleCompatibility';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const encode = (str: string) => new TextEncoder().encode(str);
const navPath = 'OPS/nav.xhtml';
const ncxPath = 'OPS/toc.ncx';
const chapterPath = 'OPS/chapter#first.xhtml';
const chapter = '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
  '<h1 id="seção">Seção</h1><p id="página">Página 1</p>' +
  '<a name="legado">Âncora antiga</a></body></html>';

function fixture(fragment: string) {
  const target = 'chapter%23first.xhtml#' + fragment;
  const nav = '<html xmlns="http://www.w3.org/1999/xhtml" ' +
    'xmlns:epub="http://www.idpf.org/2007/ops"><body>' +
    '<nav epub:type="toc"><ol><li><a href="' + target + '">Seção</a></li></ol></nav>' +
    '<nav epub:type="page-list"><ol><li><a href="chapter%23first.xhtml#p%C3%A1gina">' +
    '1</a></li></ol></nav>' +
    '<nav epub:type="landmarks"><ol><li><a epub:type="bodymatter" ' +
    'href="chapter%23first.xhtml#legado">Começo</a></li></ol></nav>' +
    '</body></html>';
  const ncx = '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">' +
    '<navMap><navPoint id="one" playOrder="1"><navLabel><text>Seção</text></navLabel>' +
    '<content src="' + target + '"/></navPoint></navMap></ncx>';
  const raw = [
    [navPath, nav], [ncxPath, ncx], [chapterPath, chapter],
  ] as Array<[string, string]>;
  const files = new Map(raw.map(([path, content]) => [
    path, { path, bytes: encode(content), directory: false },
  ]));
  const loaded = { files } as unknown as LoadedEpub;
  const item = (id: string, path: string, mime: string, properties: string[] = []) => ({
    id, href: path.replace(/^OPS\//u, ''), resolvedPath: path,
    mediaType: mime, properties, pathSafe: true, exists: true,
  });
  const navItem = item('nav', navPath, 'application/xhtml+xml', ['nav']);
  const ncxItem = item('ncx', ncxPath, 'application/x-dtbncx+xml');
  const pkg = { version: '3.3', opfPath: 'OPS/book.opf', opfDir: 'OPS',
    manifest: [navItem, ncxItem, item('chapter', chapterPath, 'application/xhtml+xml')],
    navItem, ncxItem, spine: [], metadata: { title: 'Livro' }, rootfileCount: 1,
  } as PackageDocumentInfo;
  return { loaded, pkg };
}
describe('E-039: URLs escapadas entre NAV, NCX e nomes físicos ZIP', () => {
  it('aceita UTF-8 em fragmentos, %23 em arquivo e âncora XHTML legada', () => {
    const { loaded, pkg } = fixture('se%C3%A7%C3%A3o');
    const codes = [...validateInternalAnchors(loaded, pkg),
      ...validateKindleCompatibility(loaded, pkg), ...validateNavigation(loaded, pkg)]
      .map((issue) => issue.code);
    expect(codes).not.toContain('NCX_MISSING_FRAGMENT');
    expect(codes).not.toContain('CONTENT_MISSING_FRAGMENT');
    expect(codes).not.toContain('NCX_CONTENT_MISSING_RESOURCE');
    expect(codes).not.toContain('NAV_INVALID_STRUCTURE');
  });
  it('distingue fragmento inexistente de capítulo existente em ambos índices', () => {
    const { loaded, pkg } = fixture('ausente');
    expect(validateInternalAnchors(loaded, pkg).map((issue) => issue.code))
      .toContain('CONTENT_MISSING_FRAGMENT');
    expect(validateKindleCompatibility(loaded, pkg).map((issue) => issue.code))
      .toContain('NCX_MISSING_FRAGMENT');
  });
  it('fragmento de âncora legada e page-list não exige índice por arquivo', () => {
    const { loaded, pkg } = fixture('legado');
    expect(validateInternalAnchors(loaded, pkg)
      .filter((issue) => issue.code === 'CONTENT_MISSING_FRAGMENT')).toEqual([]);
  });
});
