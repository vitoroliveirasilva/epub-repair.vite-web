// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { validateAccessibility } from '../src/epub/validation/validateAccessibility';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

function check(body: string) {
  const path='OPS/chapter.xhtml';
  const xml='<html xmlns="http://www.w3.org/1999/xhtml" ' +
    'xmlns:svg="http://www.w3.org/2000/svg"><body>' + body + '</body></html>';
  const loaded={files:new Map([[path,{bytes:new TextEncoder().encode(xml)}]])} as unknown as LoadedEpub;
  const pkg={manifest:[{id:'c',resolvedPath:path,exists:true,
    mediaType:'application/xhtml+xml'}]} as unknown as PackageDocumentInfo;
  return validateAccessibility(loaded,pkg);
}
describe('E-072: rótulos acessíveis e SVG inline não destrutivos', () => {
  it('detecta referências aria-labelledby ausentes', () => {
    expect(check('<p id="p1">Texto</p><figure aria-labelledby="ausente">Imagem</figure>')
      .map(i=>i.code)).toContain('CONTENT_ARIA_LABELLED_BY_MISSING');
  });
  it('aceita múltiplos IDs de rótulo que existem', () => {
    expect(check('<h2 id="first">Título</h2><p id="last">Autor</p>' +
      '<section aria-labelledby="first last"><p>Texto</p></section>')).toEqual([]);
  });
  it('diagnostica aria-describedby ausente sem reescrever o documento', () => {
    const issues = check('<p id="legenda">Descrição</p>' +
      '<figure aria-describedby="legenda ausente">Gráfico</figure>');
    expect(issues.map((i) => i.code)).toEqual(['CONTENT_ARIA_DESCRIBED_BY_MISSING']);
    expect(issues[0]?.context).toBe('ausente');
    expect(issues[0]?.repairable).toBe(false);
  });
  it('aceita descrição acessível com múltiplos identificadores existentes', () => {
    expect(check('<p id="a">Uma</p><p id="b">Duas</p>' +
      '<figure aria-describedby="a b">Imagem</figure>')).toEqual([]);
  });
  it('sinaliza IDs ARIA duplicados mesmo que todos os alvos existam', () => {
    const issues = check('<p id="legenda">Texto</p><p id="legenda">Outra legenda</p>' +
      '<figure aria-describedby="legenda">Imagem</figure>');
    expect(issues.map((issue) => issue.code)).toEqual(['CONTENT_ARIA_REFERENCE_AMBIGUOUS']);
    expect(issues[0]?.context).toBe('legenda');
  });
  it('identifica idioma incoerente na raiz sem tentar adivinhar a língua correta', () => {
    const path = 'OPS/chapter.xhtml';
    const xml = '<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR" ' +
      'xml:lang="en" xmlns:xml="http://www.w3.org/XML/1998/namespace">' +
      '<body><p>Texto</p></body></html>';
    const loaded = { files: new Map([[path, { bytes: new TextEncoder().encode(xml) }]]) } as
      unknown as LoadedEpub;
    const pkg = { manifest: [{ id: 'c', resolvedPath: path, exists: true,
      mediaType: 'application/xhtml+xml' }] } as unknown as PackageDocumentInfo;
    const issues = validateAccessibility(loaded, pkg);
    expect(issues.map((issue) => issue.code)).toContain('CONTENT_LANGUAGE_CONFLICT');
    expect(issues.every((issue) => issue.repairable === false)).toBe(true);
  });
  it('distingue links vazios de links com texto, aria-label ou imagem alt', () => {
    const issues = check('<a href="#destino"></a>' +
      '<a href="https://example.org">Referência</a>' +
      '<a href="#fig"><img src="img.png" alt="Figura do livro"/></a>' +
      '<a href="#top" aria-label="Voltar ao topo"></a>');
    expect(issues.map((issue) => issue.code)).toEqual(['CONTENT_LINK_NAME_MISSING']);
    expect(issues[0]?.severity).toBe('info');
  });
  it('trata SVG decorativo como válido e não exige descrição textual', () => {
    expect(check('<svg:svg aria-hidden="true"><svg:circle r="2"/></svg:svg>')).toEqual([]);
  });
  it('detecta SVG significativo sem título nem rótulo como informação', () => {
    const issues=check('<svg:svg role="img"><svg:rect width="2" height="2"/></svg:svg>');
    expect(issues.map(i=>i.code)).toContain('CONTENT_INLINE_SVG_LABEL_MISSING');
    expect(issues.every(i=>i.repairable===false)).toBe(true);
    expect(issues[0]?.severity).toBe('info');
  });
  it('aceita SVG com title visível ou aria-label sem duplicar alertas', () => {
    expect(check('<svg:svg><svg:title>Figura da obra</svg:title>' +
      '<svg:rect width="2" height="2"/></svg:svg>')).toEqual([]);
    expect(check('<svg:svg aria-label="Ilustração"><svg:circle r="1"/></svg:svg>'))
      .toEqual([]);
  });
  it('mantém alt vazio decorativo válido, mas sinaliza imagens sem alt', () => {
    expect(check('<img src="a.jpg" alt=""/><img src="b.jpg"/>')
      .map(i=>i.code)).toEqual(['CONTENT_IMAGE_ALT_MISSING']);
  });
});
