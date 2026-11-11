import { describe, expect, it } from 'vitest';
import { classifyPage } from '../src/converter/pdfEngine';

describe('classificação de páginas do conversor', () => {
  it('separa capa, página textual, digitalização, visual e página vazia', () => {
    expect(classifyPage(1, 0, 1)).toBe('cover');
    expect(classifyPage(8, 420, 0)).toBe('text');
    expect(classifyPage(9, 0, 1)).toBe('scanned');
    expect(classifyPage(10, 45, 1)).toBe('visual');
    expect(classifyPage(11, 0, 0)).toBe('blank');
  });

  it('não envia página curta de capítulo com texto nativo para OCR', () => {
    expect(classifyPage(20, 10, 0)).toBe('text');
  });
});
