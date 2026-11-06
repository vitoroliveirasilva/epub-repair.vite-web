// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo, ManifestItem } from '../src/epub/model/opfTypes';
import { validateImageResources, sniffImageKind } from '../src/epub/validation/validateImageResources';
import { validateAccessibility } from '../src/epub/validation/validateAccessibility';

const encoder = new TextEncoder();
function setup(mime: string, path: string, content: Uint8Array) {
  const item: ManifestItem = {
    id: 'resource', href: path, mediaType: mime, resolvedPath: path,
    pathSafe: true, exists: true, properties: [],
  };
  return {
    loaded: { files: new Map([[path, { path, bytes: content, directory: false }]]) } as LoadedEpub,
    pkg: { opfPath: 'book.opf', opfDir: '', version: '3.0',
      metadata: {}, manifest: [item], spine: [], rootfileCount: 1 } as PackageDocumentInfo,
  };
}

describe('E-067: inspeção de imagens sem modificação automática', () => {
  it('aceita assinaturas JPEG e PNG coerentes', () => {
    const jpeg = setup('image/jpeg', 'cover.jpg', Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]));
    const png = setup('image/png', 'cover.png', Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]));
    expect(validateImageResources(jpeg.loaded, jpeg.pkg)).toHaveLength(0);
    expect(validateImageResources(png.loaded, png.pkg)).toHaveLength(0);
    expect(sniffImageKind(jpeg.loaded.files.get('cover.jpg')!.bytes)).toBe('jpeg');
  });

  it('detecta assinatura incompatível com MIME declarado', () => {
    const fixture = setup('image/png', 'cover.png', encoder.encode('GIF89a\u0001\u0000\u0001\u0000'));
    expect(validateImageResources(fixture.loaded, fixture.pkg).map((x) => x.code))
      .toContain('IMAGE_INVALID_SIGNATURE');
  });

  it('avisa sobre dimensões nulas no cabeçalho GIF', () => {
    const fixture = setup('image/gif', 'cover.gif', Uint8Array.from(
      [71, 73, 70, 56, 57, 97, 0, 0, 4, 0],
    ));
    expect(validateImageResources(fixture.loaded, fixture.pkg).map((x) => x.code))
      .toContain('IMAGE_INVALID_DIMENSIONS');
  });
});

describe('E-072: acessibilidade editorial sem modificar texto', () => {
  it('detecta alt ausente, mas não sinaliza alt vazio decorativo', () => {
    const x = setup('application/xhtml+xml', 'chapter.xhtml', encoder.encode(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
      '<img src="a.jpg"/><img src="b.jpg" alt=""/>' +
      '</body></html>',
    ));
    const issues = validateAccessibility(x.loaded, x.pkg);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('CONTENT_IMAGE_ALT_MISSING');
    expect(issues[0]?.repairable).toBe(false);
  });
});
