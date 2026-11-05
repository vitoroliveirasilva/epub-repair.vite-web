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
