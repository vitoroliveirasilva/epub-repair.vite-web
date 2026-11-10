
import { describe, expect, it } from 'vitest';
import { validateManifestFallbacks } from '../src/epub/validation/validateManifestFallbacks';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

function check(fallback?: string, src = 'image.heic', mime = 'image/heic') {
  const path = 'OPS/one.xhtml';
  const markup = '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
    '<img src="' + src + '" alt="Descrição editorial"/></body></html>';
  const item = (id: string, resolvedPath: string, mediaType: string, next?: string) =>
    ({ id, resolvedPath, mediaType, fallback: next, href: resolvedPath.slice(4),
      pathSafe: true, exists: true, properties: [] });
  const source = item('one',path,'application/xhtml+xml');
  const foreign = item('image','OPS/image.heic',mime,fallback);
  const local = item('fallback','OPS/image.png','image/png');
  const pkg = { version:'3.3', opfPath:'OPS/book.opf',
    manifest:[source,foreign,local], spine:[], rootfileCount:1,
    metadata:{} } as unknown as PackageDocumentInfo;
  const loaded = { files: new Map([[path,{bytes:new TextEncoder().encode(markup)}]]) } as unknown as LoadedEpub;
  return validateManifestFallbacks(pkg, loaded).map((i) => i.code);
}

describe('E-041: fallbacks de imagens estrangeiras incorporadas ao XHTML', () => {
  it('identifica HEIC incorporado sem fallback core, mas não apaga o texto alt', () => {
    expect(check()).toContain('OPF_FOREIGN_CONTENT_FALLBACK_MISSING');
  });
  it('aceita HEIC com fallback para PNG declarado', () => {
    expect(check('fallback')).not.toContain('OPF_FOREIGN_CONTENT_FALLBACK_MISSING');
  });
  it('imagem PNG core não necessita fallback adicional', () => {
    expect(check(undefined,'image.heic','image/png'))
      .not.toContain('OPF_FOREIGN_CONTENT_FALLBACK_MISSING');
  });
  it('não acusa imagem estrangeira escrita apenas como texto editorial', () => {
    expect(check(undefined,'https://example.org/illustracao.heic'))
      .not.toContain('OPF_FOREIGN_CONTENT_FALLBACK_MISSING');
  });
});
