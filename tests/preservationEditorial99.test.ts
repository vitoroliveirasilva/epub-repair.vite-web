// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';
import { auditPreservation } from '../src/epub/repair/preservationAudit';

const encoder = new TextEncoder();
const markup = (body: string) =>
  `<html xmlns="http://www.w3.org/1999/xhtml"><body>${body}</body></html>`;

function compare(original: string, updated: string, changedLinear?: string) {
  const path = 'OPS/Text/capitulo.xhtml';
  const item = {
    id: 'capitulo', href: 'Text/capitulo.xhtml', mediaType: 'application/xhtml+xml',
    properties: [], exists: true, pathSafe: true, resolvedPath: path,
  };
  const loaded = { files: new Map([[path, { bytes: encoder.encode(original) }]]) } as unknown as LoadedEpub;
  const pkg = { opfPath: 'OPS/content.opf', opfDir: 'OPS', metadata: {}, version: '3.3',
    manifest: [item], spine: [{ idref: 'capitulo', linear: 'yes', manifestItem: item }],
    rootfileCount: 1 } as PackageDocumentInfo;
  const after = { ...pkg, spine: [{
    ...pkg.spine[0], ...(changedLinear ? { linear: changedLinear } : {}),
  }] } as PackageDocumentInfo;
  return () => auditPreservation(loaded,
    new Map([[path, encoder.encode(updated)]]), pkg, after);
}

describe('E-064/E-065: proteção de texto e estrutura editorial antes/depois', () => {

  it('E-065: preserva referências existentes do NCX mesmo com playOrder alterado', () => {
    const encoder = new TextEncoder();
    const ncxPath = 'OPS/toc.ncx';
    const chapter = 'OPS/Text/capitulo.xhtml';
    const oldNcx = '<ncx><navMap><navPoint playOrder="2"><content src="Text/capitulo.xhtml#inicio"/>' +
      '</navPoint></navMap></ncx>';
    const goodNcx = oldNcx.replace('playOrder="2"', 'playOrder="1"');
    const item = { id: 'chapter', href: 'Text/capitulo.xhtml', mediaType: 'application/xhtml+xml',
      properties: [], pathSafe: true, exists: true, resolvedPath: chapter };
    const nav = { ...item, id: 'toc', href: 'toc.ncx',
      mediaType: 'application/x-dtbncx+xml', resolvedPath: ncxPath };
    const loaded = { files: new Map([
      [ncxPath, { bytes: encoder.encode(oldNcx) }],
      [chapter, { bytes: encoder.encode(markup('<p id="inicio">Texto</p>')) }],
    ]) } as unknown as LoadedEpub;
    const pkg = {
      opfPath: 'OPS/book.opf', opfDir: 'OPS', version: '2.0',
      metadata: {}, manifest: [item, nav], ncxItem: nav,
      spine: [{ idref: 'chapter', manifestItem: item }], rootfileCount: 1,
    } as PackageDocumentInfo;
    const output = new Map([
      [ncxPath, encoder.encode(goodNcx)],
      [chapter, encoder.encode(markup('<p id="inicio">Texto</p>'))],
    ]);
    expect(() => auditPreservation(loaded, output, pkg, pkg)).not.toThrow();
    output.set(ncxPath, encoder.encode(goodNcx.replace('#inicio', '#errado')));
    expect(() => auditPreservation(loaded, output, pkg, pkg)).toThrow(/sumário/u);
  });

  it('E-049: proíbe desaparecimento de ruby e fórmulas matemáticas na sanitização', () => {
    const original = markup('<p>Leitura <ruby>漢<rt>kan</rt></ruby> e ' +
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>.</p>');
    const withoutRuby = markup('<p>Leitura 漢 kan e ' +
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>.</p>');
    expect(compare(original, withoutRuby)).toThrow(/MathML\/ruby/u);
    const withoutMath = markup('<p>Leitura <ruby>漢<rt>kan</rt></ruby> e x.</p>');
    expect(compare(original, withoutMath)).toThrow(/MathML\/ruby/u);
  });

  it('E-049: não perde marcação explícita de leitura direita para esquerda', () => {
    const before = markup('<p dir="rtl">תוכן בעברית</p>');
    const after = markup('<p>תוכן בעברית</p>');
    expect(compare(before, after)).toThrow(/direção de leitura/u);
  });

  it('recusa fusão de dois parágrafos sem apagar nenhuma palavra', () => {
    const before = markup('<p>Primeiro parágrafo.</p><p>Segundo parágrafo.</p>');
    const after = markup('<p>Primeiro parágrafo. Segundo parágrafo.</p>');
    expect(compare(before, after)).toThrow(/blocos editoriais/u);
  });

  it('recusa troca de ordem de títulos e lista mesmo se as mesmas palavras permanecerem', () => {
    const before = markup('<h1>Capítulo Um</h1><p>Início</p><li>Nota</li>');
    const after = markup('<h1>Capítulo Um</h1><li>Nota</li><p>Início</p>');
    expect(compare(before, after)).toThrow();
  });

  it('preserva adições de texto explicitamente identificáveis sem perder parágrafos', () => {
    const before = markup('<p>Leia este trecho.</p>');
    const after = markup('<p>Leia este trecho. [Imagem indisponível]</p>');
    const warnings = compare(before, after)();
    expect(warnings.some((x) => /acréscimos/u.test(x))).toBe(true);
  });

  it('recusa remover âncora legada name de notas internas', () => {
    const before = markup('<a name="nota-1"></a><p>Nota de rodapé.</p>');
    const after = markup('<a></a><p>Nota de rodapé.</p>');
    expect(compare(before, after)).toThrow(/âncora editorial/u);
  });

  it('recusa alterar linear de capítulo existente mesmo preservando bytes e spine', () => {
    const text = markup('<h1>Apêndice</h1>');
    expect(compare(text, text, 'no')).toThrow(/linear/u);
  });
});
