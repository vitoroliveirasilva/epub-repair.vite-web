// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { validatePackageSemantics } from '../src/epub/validation/validatePackageSemantics';
import { validateManifestFallbacks } from '../src/epub/validation/validateManifestFallbacks';
import { parseOpfDocument } from '../src/epub/validation/opfParser';
import { parseXml } from '../src/epub/utils/xmlUtils';
import type { LoadedEpub } from '../src/epub/model/epubTypes';

function inspect(direction: string, linear: Array<string | undefined>,
  foreign = '', fallback = '') {
  const documents = [
    '<item id="one" href="one.xhtml" media-type="application/xhtml+xml"/>',
    '<item id="two" href="two.xhtml" media-type="application/xhtml+xml"/>',
  ];
  if (foreign) documents.push('<item id="foreign" href="foreign.bin" ' +
    'media-type="application/pdf"' + (fallback ? ' fallback="' + fallback + '"' : '') + '/>');
  const items = ['one', 'two', ...(foreign ? ['foreign'] : [])].map((idref, index) =>
    '<itemref idref="' + idref + '"' +
      (linear[index] !== undefined ? ' linear="' + linear[index] + '"' : '') + '/>');
  const source = '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" ' +
    'unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:spine-book</dc:identifier>' +
    '<dc:title>Livro</dc:title><dc:language>pt-BR</dc:language>' +
    '<meta property="dcterms:modified">2026-11-05T12:00:00Z</meta></metadata>' +
    '<manifest>' + documents.join('') + '</manifest><spine' +
      (direction ? ' page-progression-direction="' + direction + '"' : '') + '>' +
      items.join('') + '</spine></package>';
  const bytes = new TextEncoder().encode(source);
  const files = new Map<string, { bytes: Uint8Array }>([
    ['OPS/book.opf', { bytes }],
    ['OPS/one.xhtml', { bytes: new TextEncoder().encode('<html/>') }],
    ['OPS/two.xhtml', { bytes: new TextEncoder().encode('<html/>') }],
    ['OPS/foreign.bin', { bytes: Uint8Array.of(1,2,3,4) }],
  ]);
  const pkg = parseOpfDocument(parseXml(source), 'OPS/book.opf', files);
  const loaded = { files } as LoadedEpub;
  return [...validatePackageSemantics(loaded, pkg),
    ...validateManifestFallbacks(pkg)].map((issue) => issue.code);
}

describe('E-044: spine linear e direção de leitura sem reordenar capítulos', () => {
  it('aceita direções ltr/rtl/default e itens não lineares legítimos', () => {
    for (const direction of ['ltr','rtl','default']) {
      const codes = inspect(direction,['yes','no']);
      expect(codes).not.toContain('OPF_SPINE_DIRECTION_INVALID');
      expect(codes).not.toContain('OPF_SPINE_LINEAR_INVALID');
    }
  });
  it('valores ausentes de linear significam padrão de leitura, não falha', () => {
    expect(inspect('',[undefined,'no'])).not.toContain('OPF_SPINE_LINEAR_INVALID');
  });
  it('detecta direção inválida e linear que não é yes/no sem tentar corrigir', () => {
    const issues = inspect('diagonal',['yes','maybe']);
    expect(issues).toContain('OPF_SPINE_DIRECTION_INVALID');
    expect(issues).toContain('OPF_SPINE_LINEAR_INVALID');
  });
  it('não valida spine com todas as entradas explicitamente não lineares', () => {
    expect(inspect('rtl',['no','no'])).toContain('OPF_SPINE_LINEAR_INVALID');
  });
  it('exige fallback real para recurso estrangeiro da ordem de leitura', () => {
    expect(inspect('ltr',['yes','yes','yes'],'application/pdf'))
      .toContain('OPF_SPINE_FOREIGN_FALLBACK_MISSING');
    expect(inspect('ltr',['yes','yes','no'],'application/pdf','one'))
      .not.toContain('OPF_SPINE_FOREIGN_FALLBACK_MISSING');
  });
});
