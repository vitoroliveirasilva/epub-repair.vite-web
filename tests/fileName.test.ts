import { describe, expect, it } from 'vitest';
import { deriveTitleFromFileName, makeRepairedFileName } from '../src/epub/utils/fileName';

describe('fileName', () => {
  it('mantém nome original e adiciona sufixo mínimo', () => {
    expect(makeRepairedFileName('Livro Épico.epub')).toBe('Livro Épico-k.epub');
  });

  it('adiciona extensão quando necessário', () => {
    expect(makeRepairedFileName('Livro')).toBe('Livro-k.epub');
  });

  it('deriva título legível do arquivo', () => {
    expect(deriveTitleFromFileName('Meu_Livro-final.epub')).toBe('Meu Livro final');
  });
});
