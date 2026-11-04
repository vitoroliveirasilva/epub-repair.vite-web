import { describe, expect, it } from 'vitest';
import { readCoverImageFile } from '../src/epub/cover/coverImageInput';

function coverFile(bytes: Uint8Array, name = 'cover.png'): File {
  return {
    name,
    size: bytes.length,
    type: 'image/png',
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  } as File;
}

describe('validação de capas', () => {
  it('não aceita formato alegado apenas por extensão ou MIME', async () => {
    await expect(readCoverImageFile(coverFile(new TextEncoder().encode('<script>evil()</script>'))))
      .rejects.toThrow('Formato de capa não suportado');
  });

  it('rejeita PNG sem IHDR íntegro', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 0, 0, 0, 0]);
    await expect(readCoverImageFile(coverFile(png))).rejects.toThrow('IHDR');
  });

  it('rejeita imagens com dimensões exageradas sem precisar decodificá-las', async () => {
    const png = new Uint8Array(33);
    png.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    const view = new DataView(png.buffer);
    view.setUint32(16, 100000, false);
    view.setUint32(20, 100000, false);
    await expect(readCoverImageFile(coverFile(png))).rejects.toThrow('Dimensões');
  });
});
