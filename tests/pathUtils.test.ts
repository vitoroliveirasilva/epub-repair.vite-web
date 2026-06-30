import { describe, expect, it } from 'vitest';
import { normalizeInternalPath, resolveReference } from '../src/epub/utils/pathUtils';

describe('pathUtils', () => {
  it('normaliza barras, espaços e segmentos simples', () => {
    expect(normalizeInternalPath('./OPS\\chapter 1.xhtml').path).toBe('OPS/chapter 1.xhtml');
  });

  it('marca path traversal como inseguro', () => {
    const result = normalizeInternalPath('../../evil.xhtml');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('..');
  });

  it('resolve referências com URL encoding e fragmento', () => {
    expect(resolveReference('OPS/Text/chapter.xhtml', '../Images/capa%201.jpg#img').path).toBe(
      'OPS/Images/capa 1.jpg',
    );
  });
});
