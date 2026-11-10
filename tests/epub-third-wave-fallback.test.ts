
import { describe, expect, it, vi } from 'vitest';
import { readCoverImageFile } from '../src/epub/cover/coverImageInput';

const png = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYk0AAAAASUVORK5CYII=', 'base64'));
function file(bytes: Uint8Array, name: string): File {
  return {
    name, size: bytes.length, type: 'application/octet-stream',
    arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer),
  } as File;
}
describe('E-121: validação de imagem em navegador sem createImageBitmap', () => {
  it('confirma decodificação alternativa e dimensões reais antes de aceitar PNG', async () => {
    const baseUrl=URL;
    let revoked = false;
    vi.stubGlobal('createImageBitmap', undefined);
    vi.stubGlobal('Image', class {
      naturalWidth = 1;
      naturalHeight = 1;
      src = '';
      decode() { return Promise.resolve(); }
    });
    vi.stubGlobal('URL', Object.assign(class extends baseUrl {}, {
      createObjectURL: () => 'blob:epub-test',
      revokeObjectURL: () => { revoked = true; },
    }));
    try {
      const cover = await readCoverImageFile(file(png,'capa.png'));
      expect(cover.mediaType).toBe('image/png');
      expect(revoked).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('não aceita JPEG aparente quando seu decodificador retorna erro', async () => {
    const baseUrl=URL;
    vi.stubGlobal('createImageBitmap', undefined);
    vi.stubGlobal('Image', class {
      naturalWidth=0;
      naturalHeight=0;
      src='';
      decode() { return Promise.reject(new Error('JPEG truncated')); }
    });
    vi.stubGlobal('URL', Object.assign(class extends baseUrl {}, {
      createObjectURL: () => 'blob:epub-corrupt',
      revokeObjectURL: () => {},
    }));
    try {
      await expect(readCoverImageFile(file(
        Uint8Array.of(0xff,0xd8,0xff,0xd9),'fake.jpg'))).rejects.toThrow(/corrompida/iu);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
