
import { describe, expect, it } from 'vitest';
import { validatePackageSemantics } from '../src/epub/validation/validatePackageSemantics';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

function check(meta: string, extra = '', prefix = '') {
  const path = 'OPS/book.opf';
  const source = '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" ' +
    'unique-identifier="uid"' + (prefix ? ' prefix="' + prefix + '"' : '') + '>' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:real-book</dc:identifier>' +
    '<dc:title>Livro</dc:title><dc:language>pt-BR</dc:language>' +
    '<meta property="dcterms:modified">' + meta + '</meta>' + extra +
    '</metadata><manifest/><spine/></package>';
  const loaded = { files: new Map([[path, { bytes: new TextEncoder().encode(source) }]]) } as unknown as LoadedEpub;
  const pkg = { opfPath: path, version: '3.3', manifest: [], spine: [] } as unknown as PackageDocumentInfo;
  return validatePackageSemantics(loaded, pkg).map((x) => x.code);
}

describe('E-043: metadados OPF EPUB3 e prefixos', () => {
  it('aceita identificador e data UTC exata, inclusive 29/02 de ano bissexto', () => {
    expect(check('2024-02-29T23:59:59Z')).toEqual([]);
  });
  it('rejeita 30/02 normalizado silenciosamente pelo Date.parse', () => {
    expect(check('2024-02-30T23:59:59Z')).toContain('OPF_MODIFIED_INVALID');
  });
  it('rejeita data não UTC, fração de segundos e múltiplos dcterms:modified', () => {
    expect(check('2025-03-06T02:30:00-03:00')).toContain('OPF_MODIFIED_INVALID');
    expect(check('2025-03-06T02:30:00.123Z')).toContain('OPF_MODIFIED_INVALID');
    expect(check('2026-11-05T12:00:00Z',
      '<meta property="dcterms:modified">2026-11-05T12:00:01Z</meta>'))
      .toContain('OPF_MODIFIED_INVALID');
  });
  it('aceita mapeamento customizado e prefixo reservado dcterms sem declarar', () => {
    expect(check('2026-11-05T12:00:00Z',
      '<meta property="series:identifier">AB</meta>',
      'series: https://example.org/vocab#')).toEqual([]);
  });
  it('marca prefixo desconhecido que não foi mapeado no package', () => {
    expect(check('2026-11-05T12:00:00Z',
      '<meta property="series:identifier">AB</meta>')).toContain('OPF_PREFIX_UNDECLARED');
  });
  it('sinaliza mapeamentos duplicados e atributo sintaticamente inválido', () => {
    expect(check('2026-11-05T12:00:00Z', '', 'foo: https://a.org/ foo: https://b.org/'))
      .toContain('OPF_PREFIX_INVALID');
    expect(check('2026-11-05T12:00:00Z', '', '???'))
      .toContain('OPF_PREFIX_INVALID');
  });
  it('não aceita javascript no atributo prefix que expande propriedades', () => {
    expect(check('2026-11-05T12:00:00Z', '', 'evil: javascript:alert(1)'))
      .toContain('OPF_PREFIX_INVALID');
  });
});
