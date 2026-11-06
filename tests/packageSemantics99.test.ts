// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { validatePackageSemantics } from '../src/epub/validation/validatePackageSemantics';
import { parseOpfDocument } from '../src/epub/validation/opfParser';
import { parseXml } from '../src/epub/utils/xmlUtils';
import type { LoadedEpub } from '../src/epub/model/epubTypes';

const makeOpf = (params: {
  version?: string; key?: string; modified?: string;
  nav?: string; spine?: string; extras?: string;
} = {}) => {
  const version = params.version ?? '3.0';
  const key = params.key ?? 'book-id';
  const modified = params.modified === undefined
    ? '<meta property="dcterms:modified">2026-11-05T10:00:00Z</meta>'
    : params.modified;
  const nav = params.nav ?? '<item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>';
  const spine = params.spine ?? '<spine page-progression-direction="rtl"><itemref idref="text" linear="yes"/></spine>';
  return `<package xmlns="http://www.idpf.org/2007/opf" version="${version}"
    unique-identifier="${key}">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:012345</dc:identifier>
    <dc:title>Exemplo</dc:title><dc:language>pt-BR</dc:language>
    ${modified}${params.extras ?? ''}
    </metadata><manifest>
      ${nav}<item id="text" href="text.xhtml" media-type="application/xhtml+xml"/>
    </manifest>${spine}</package>`;
};

function inspect(opf: string) {
  const bytes = new TextEncoder().encode(opf);
  const files = new Map([['OPS/book.opf', { bytes }]]);
  const loaded = { files } as unknown as LoadedEpub;
  const pkg = parseOpfDocument(parseXml(opf), 'OPS/book.opf', new Map());
  return validatePackageSemantics(loaded, pkg).map((issue) => issue.code);
}

describe('Metadados e semântica OPF', () => {
  it('E-043/E-044: aceita identificador, data UTC e direção RTL legítimos', () => {
    expect(inspect(makeOpf())).toEqual([]);
  });
  it('E-043: exige unique-identifier com alvo real e data UTC em EPUB3', () => {
    const codes = inspect(makeOpf({ key: 'inexistente', modified: '' }));
    expect(codes).toContain('OPF_UNIQUE_IDENTIFIER_INVALID');
    expect(codes).toContain('OPF_MODIFIED_INVALID');
    expect(inspect(makeOpf({ version: '2.0', modified: '' })))
      .not.toContain('OPF_MODIFIED_INVALID');
  });
  it('E-043: detecta refines quebrado sem modificar conteúdo editorial', () => {
    const codes = inspect(makeOpf({ extras:
      '<meta property="file-as" refines="#ausente">Sobrenome</meta>',
    }));
    expect(codes).toContain('OPF_REFINES_MISSING_TARGET');
  });
  it('E-042: detecta nav duplicado e cover-image em HTML', () => {
    const nav = '<item id="nav1" href="nav1.xhtml" properties="nav" media-type="application/xhtml+xml"/>' +
      '<item id="nav2" href="nav2.xhtml" properties="nav" media-type="application/xhtml+xml"/>' +
      '<item id="cover" href="cover.xhtml" properties="cover-image" media-type="application/xhtml+xml"/>';
    expect(inspect(makeOpf({ nav }))).toContain('OPF_MANIFEST_PROPERTY_INVALID');
  });
  it('E-044: flags spine linear e page-progression-direction inválidos', () => {
    const spine = '<spine page-progression-direction="top-to-bottom">' +
      '<itemref idref="text" linear="no"/></spine>';
    const codes = inspect(makeOpf({ spine }));
    expect(codes).toContain('OPF_SPINE_DIRECTION_INVALID');
    expect(codes).toContain('OPF_SPINE_LINEAR_INVALID');
  });
});
