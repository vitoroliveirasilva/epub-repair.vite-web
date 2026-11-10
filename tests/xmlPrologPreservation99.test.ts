
import { describe, expect, it } from 'vitest';
import { parseXml, serializeXmlPreservingDeclaration } from '../src/epub/utils/xmlUtils';
import { decodeUtf8ForRewrite } from '../src/epub/utils/textEncoding';

describe('E-033: declaração XML não desaparece em regravações OPF/NCX', () => {
  it('preserva declaração XML/UTF-8 com standalone e sem alterar texto Unicode', () => {
    const original = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<package xmlns="http://www.idpf.org/2007/opf"><metadata>' +
      '<title>São Paulo — Camões</title></metadata></package>';
    const doc = parseXml(original);
    doc.documentElement.setAttribute('version', '3.0');
    const result = serializeXmlPreservingDeclaration(doc,
      decodeUtf8ForRewrite(new TextEncoder().encode(original), 'OPS/book.opf'));
    expect(result.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'))
      .toBe(true);
    expect(result).toContain('São Paulo — Camões');
    expect(result).toContain('version="3.0"');
    expect(parseXml(result).documentElement.localName).toBe('package');
  });
  it('preserva declaração NCX original em normalização de conteúdo', () => {
    const original = '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">' +
      '<docTitle><text>Original</text></docTitle></ncx>';
    const doc = parseXml(original);
    doc.getElementsByTagName('text')[0]!.textContent = 'Corrigido';
    const result = serializeXmlPreservingDeclaration(doc, original);
    expect(result).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(result).toContain('Corrigido');
  });
  it('não inventa declaração em arquivos que não tinham declaração', () => {
    const original = '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"/>';
    expect(serializeXmlPreservingDeclaration(parseXml(original), original))
      .not.toMatch(/<\?xml/iu);
  });
});
