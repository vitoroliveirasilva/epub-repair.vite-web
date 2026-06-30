import { describe, expect, it } from 'vitest';
import { sanitizeHtmlDocument } from '../src/epub/sanitize/sanitizeHtml';

describe('sanitizeHtmlDocument', () => {
  it('troca imagem ausente por marcador textual visível', () => {
    const result = sanitizeHtmlDocument('<p><img src="../img/foto.png" alt="foto" /></p>', {
      filePath: 'OPS/Text/cap.xhtml',
      existingFiles: new Set(['OPS/Text/cap.xhtml']),
      kindleSafeMode: true,
      removeRemoteResourceLinks: true,
      sanitizeScripts: true,
    });
    expect(result.text).toContain('[Imagem indisponível: foto.png]');
  });

  it('transforma link externo em texto', () => {
    const result = sanitizeHtmlDocument('<a href="https://example.com">Site externo</a>', {
      filePath: 'OPS/Text/cap.xhtml',
      existingFiles: new Set(['OPS/Text/cap.xhtml']),
      kindleSafeMode: true,
      removeRemoteResourceLinks: true,
      sanitizeScripts: true,
    });
    expect(result.text).toBe('Site externo');
  });
});
