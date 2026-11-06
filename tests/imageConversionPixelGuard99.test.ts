import { describe, expect, it } from 'vitest';
import { isJpegSampleVisuallyComparable } from '../src/epub/repair/repairImages';

describe('E-067: fidelidade visual amostrada de JPEG normalizado', () => {
  it('permite pequenas variações do JPEG lossy com mesmos pixels aproximados', () => {
    const a = Uint8ClampedArray.of(120, 100, 80, 255, 40, 60, 80, 255);
    const b = Uint8ClampedArray.of(126, 94, 83, 255, 40, 62, 82, 255);
    expect(isJpegSampleVisuallyComparable(a, b)).toBe(true);
  });
  it('recusa branco/corrompido ou diferenças de cor extensas', () => {
    const a = Uint8ClampedArray.of(0, 20, 30, 255, 20, 50, 60, 255);
    const b = Uint8ClampedArray.of(250, 250, 250, 255, 250, 250, 250, 255);
    expect(isJpegSampleVisuallyComparable(a, b)).toBe(false);
  });
  it('não aceita arrays com tamanhos distintos, vazios ou sem pixels RGBA completos', () => {
    expect(isJpegSampleVisuallyComparable(new Uint8ClampedArray(), new Uint8ClampedArray()))
      .toBe(false);
    expect(isJpegSampleVisuallyComparable(Uint8ClampedArray.of(0, 0, 0, 255),
      Uint8ClampedArray.of(0, 0, 0, 255, 1))).toBe(false);
  });
});
