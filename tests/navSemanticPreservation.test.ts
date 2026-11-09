// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { auditPreservation } from '../src/epub/repair/preservationAudit';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const encode = (value: string) => new TextEncoder().encode(value);
const base = (body: string) =>
  '<html xmlns="http://www.w3.org/1999/xhtml" ' +
  'xmlns:epub="http://www.idpf.org/2007/ops">' +
  '<head><title>Sumário</title></head><body>' + body + '</body></html>';

const original = base('<nav epub:type="toc" aria-label="Sumário completo">' +
  '<ol><li><a href="chapter.xhtml" title="Abrir capítulo">Capítulo</a></li>' +
  '<li><span>Parte dois</span><ol><li><a href="chapter2.xhtml">Seção</a></li>' +
  '</ol></li></ol></nav>');

function auditNavigation(before: string, after: string) {
  const chapterPath = 'OPS/chapter.xhtml';
  const chapter2Path = 'OPS/chapter2.xhtml';
  const navPath = 'OPS/nav.xhtml';
  const chapter = { id: 'chapter', resolvedPath: chapterPath, exists: true,
    mediaType: 'application/xhtml+xml' };
  const chapter2 = { id: 'chapter2', resolvedPath: chapter2Path, exists: true,
    mediaType: 'application/xhtml+xml' };
  const nav = { id: 'nav', resolvedPath: navPath, exists: true,
    mediaType: 'application/xhtml+xml', properties: ['nav'] };
  const pkg = { manifest: [chapter, chapter2, nav], navItem: nav,
    spine: [{ idref: 'chapter', manifestItem: chapter },
      { idref: 'chapter2', manifestItem: chapter2 }] } as unknown as PackageDocumentInfo;
  const pages = '<html xmlns="http://www.w3.org/1999/xhtml">' +
    '<body><p>Texto editorial</p></body></html>';
  const loaded = { files: new Map([
    [chapterPath, { bytes: encode(pages) }],
    [chapter2Path, { bytes: encode(pages) }],
    [navPath, { bytes: encode(before) }],
  ]) } as unknown as LoadedEpub;
  const output = new Map([
    [chapterPath, encode(pages)],
    [chapter2Path, encode(pages)],
    [navPath, encode(after)],
  ]);
  return () => auditPreservation(loaded, output, pkg, pkg);
}

describe('regressão: integridade semântica NAV EPUB 3', () => {
  it('aceita índice preservado e diferença de espaços inofensiva', () => {
    expect(auditNavigation(original, original)()).toEqual([]);
    // Espaços dentro de uma palavra/etiqueta podem alterar a leitura.
    // Testar apenas whitespace de serialização XML, não texto editorial.
    const spaced = original.replace('<nav epub:type', '<nav  epub:type');
    expect(auditNavigation(original, spaced)()).toEqual([]);
  });
  it('não converte toc em landmarks mantendo os mesmos destinos', () => {
    expect(auditNavigation(original, original.replace('epub:type="toc"',
      'epub:type="landmarks"'))).toThrow(/semântica/u);
  });
  it('não perde aria-label usada por tecnologias assistivas', () => {
    expect(auditNavigation(original,
      original.replace('aria-label="Sumário completo"', 'aria-label="Índice"')))
      .toThrow(/rótulos editoriais/u);
  });
  it('não substitui a hierarquia de partes, mesmo com links intactos', () => {
    const flattened = original.replace(
      '<li><span>Parte dois</span><ol><li><a href="chapter2.xhtml">Seção</a></li></ol></li>',
      '<li><span>Parte dois</span></li><li><a href="chapter2.xhtml">Seção</a></li>');
    expect(auditNavigation(original, flattened)).toThrow();
  });
  it('não apaga título acessível do link sem alterar href ou texto', () => {
    const changed = original.replace(' title="Abrir capítulo"', '');
    expect(auditNavigation(original, changed)).toThrow(/rótulos editoriais/u);
  });
  it('não oculta o sumário alterando apenas atributo hidden', () => {
    const changed = original.replace('<nav epub:type', '<nav hidden="" epub:type');
    expect(auditNavigation(original, changed)).toThrow(/semântica/u);
  });
  it('não confunde remoção de script com alteração de navegação editorial', () => {
    const withScript = original.replace('</nav>',
      '<script>alert("script externo ao índice")</script></nav>');
    expect(auditNavigation(withScript, original)()).toEqual([]);
  });
});
