import { describe, expect, it } from 'vitest';
import { normalizeInternalPath, resolveReference } from '../src/epub/utils/pathUtils';

describe('pathUtils', () => {
  it('normaliza barras, espaços e segmentos simples', () => {
    expect(normalizeInternalPath('./OPS\\chapter 1.xhtml').path).toBe('OPS/chapter 1.xhtml');
  });

  it('preserva espaços legítimos nas partes do caminho', () => {
    expect(normalizeInternalPath('OPS/Text/ capítulo 1 .xhtml').path).toBe(
      'OPS/Text/ capítulo 1 .xhtml',
    );
  });

  it('marca path traversal como inseguro', () => {
    const result = normalizeInternalPath('../../evil.xhtml');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('..');
  });

  it('preserva caracteres especiais literais nos nomes físicos de ZIP', () => {
    expect(normalizeInternalPath('OPS/arquivo#1?.xhtml').path).toBe('OPS/arquivo#1?.xhtml');
    expect(normalizeInternalPath('OPS/Text/cap%23itulo%20um.xhtml').path)
      .toBe('OPS/Text/cap%23itulo%20um.xhtml');
    expect(resolveReference('OPS/nav.xhtml', 'Text/cap%23itulo%20um.xhtml#topo').path)
      .toBe('OPS/Text/cap#itulo um.xhtml');
    expect(resolveReference('OPS/nav.xhtml', 'Text/cap%2523itulo.xhtml').path)
      .toBe('OPS/Text/cap%23itulo.xhtml');
  });

  it('resolve referências com URL encoding e fragmento', () => {
    expect(resolveReference('OPS/Text/chapter.xhtml', '../Images/capa%201.jpg#img').path).toBe(
      'OPS/Images/capa 1.jpg',
    );
  });
});
