import { describe, expect, it } from 'vitest';
import { compareWords } from '../src/epub/tools/bookWordDiff';

describe('Destaque de diferenças editoriais', () => {
  it('detecta palavra adicionada no meio sem falsos removidos', () => {
    const result = compareWords('O livro está muito bom hoje.',
      'O livro está realmente muito bom hoje.');
    expect(result.addedWords).toBe(1);
    expect(result.removedWords).toBe(0);
    expect(result.after.some((chunk) => chunk.kind === 'added' &&
      chunk.text.includes('realmente'))).toBe(true);
    expect(result.before.some((chunk) => chunk.kind === 'added')).toBe(false);
    expect(result.truncated).toBe(false);
  });

  it('destaca substituições mesmo com palavras repetidas', () => {
    const result = compareWords('A palavra e a palavra original.',
      'A palavra e a palavra corrigida.');
    expect(result.addedWords).toBe(1);
    expect(result.removedWords).toBe(1);
    expect(result.before.some((chunk) =>
      chunk.kind === 'removed' && chunk.text.includes('original.'))).toBe(true);
    expect(result.after.some((chunk) =>
      chunk.kind === 'added' && chunk.text.includes('corrigida.'))).toBe(true);
  });

  it('evita alocação quadrática em capítulos extensos e declara amostragem', () => {
    const before = Array.from({ length: 8_000 }, (_, i) => 'original' + i).join(' ');
    const after = Array.from({ length: 8_000 }, (_, i) => 'editado' + i).join(' ');
    const result = compareWords(before, after);
    expect(result.truncated).toBe(true);
    expect(result.after.map((chunk) => chunk.text).join(' ')).toContain('omitido');
    expect(result.after.map((chunk) => chunk.text).join('').length).toBeLessThan(10_000);
  });

  it('trata textos idênticos e vazios sem alterações ou cortes falsos', () => {
    expect(compareWords('um livro', 'um livro').truncated).toBe(false);
    expect(compareWords('', '').truncated).toBe(false);
    expect(compareWords('', '').addedWords).toBe(0);
    expect(compareWords('', '').removedWords).toBe(0);
  });
});
