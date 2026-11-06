// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildNavDocument, buildNcxDocument } from '../src/epub/repair/repairNavigation';
import type { ManifestItem, PackageDocumentInfo } from '../src/epub/model/opfTypes';

const chapter: ManifestItem = {
  id: 'cap01', href: 'Text/chapter01.xhtml', mediaType: 'application/xhtml+xml',
  properties: [], resolvedPath: 'OPS/Text/chapter01.xhtml', pathSafe: true, exists: true,
};
function fixture(language: string): PackageDocumentInfo {
  return {
    opfPath: 'OPS/book.opf', opfDir: 'OPS', version: '3.0',
    metadata: { title: 'Livro', identifier: 'urn:uuid:test', language },
    manifest: [chapter], spine: [{ idref: chapter.id, manifestItem: chapter }], rootfileCount: 1,
  };
}
const contents = new Map([
  ['OPS/Text/chapter01.xhtml', { bytes: new TextEncoder().encode(
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Arquivo técnico</title></head>' +
    '<body><h1>Capítulo um &amp; análise</h1><p>Texto original</p></body></html>',
  ) }],
]);

describe('Títulos editoriais nos índices criados', () => {
  it('E-011: prefere heading real e escapa caracteres XML', () => {
    const pkg = fixture('en-US');
    const nav = buildNavDocument(pkg, 'OPS/nav.xhtml', contents);
    const ncx = buildNcxDocument({ ...pkg, version: '2.0' }, 'OPS/toc.ncx', contents);
    expect(nav).toContain('Capítulo um &amp; análise');
    expect(ncx).toContain('Capítulo um &amp; análise');
    expect(nav).toContain('lang="en-US"');
    expect(nav).toContain('xml:lang="en-US"');
    expect(nav).not.toContain('>cap01<');
  });

  it('E-011: prefere título XHTML quando capítulo não tem heading', () => {
    const book = new Map([
      ['OPS/Text/chapter01.xhtml', { bytes: new TextEncoder().encode(
        '<html xmlns="http://www.w3.org/1999/xhtml"><head>' +
        '<title>Introdução &amp; contexto</title></head><body><p>Texto.</p></body></html>',
      ) }],
    ]);
    const nav = buildNavDocument(fixture('pt-BR'), 'OPS/nav.xhtml', book);
    expect(nav).toContain('Introdução &amp; contexto');
    expect(nav).not.toContain('>cap01<');
  });

  it('E-011: usa rótulo legível de filename se não existe informação editorial', () => {
    const book = new Map([
      ['OPS/Text/chapter01.xhtml', { bytes: new TextEncoder().encode(
        '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Texto.</p></body></html>',
      ) }],
    ]);
    const nav = buildNavDocument(fixture('pt-BR'), 'OPS/nav.xhtml', book);
    expect(nav).toContain('>chapter01<');
    expect(nav).not.toContain('>cap01<');
  });
  it('E-008: não inventa idioma em navegação gerada', () => {
    const nav = buildNavDocument(fixture('UND'), 'OPS/nav.xhtml', contents);
    expect(nav).not.toContain('lang="pt-BR"');
    expect(nav).not.toContain('xml:lang="pt-BR"');
  });
});
