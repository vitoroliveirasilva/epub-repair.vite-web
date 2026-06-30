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

  it('filtra candidatos srcset remotos ou ausentes preservando os locais válidos', () => {
    const result = sanitizeHtmlDocument(
      '<img src="../img/capa.jpg" srcset="../img/capa.jpg 1x, https://cdn/img.jpg 2x, ../img/falta.jpg 3x" />',
      {
        filePath: 'OPS/Text/cap.xhtml',
        existingFiles: new Set(['OPS/Text/cap.xhtml', 'OPS/img/capa.jpg']),
        kindleSafeMode: true,
        removeRemoteResourceLinks: true,
        sanitizeScripts: true,
      },
    );
    expect(result.text).toContain('srcset="../img/capa.jpg 1x"');
    expect(result.text).not.toContain('https://cdn');
    expect(result.text).not.toContain('falta.jpg');
  });
});
