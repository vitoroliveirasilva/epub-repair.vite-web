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
