import { describe, expect, it } from 'vitest';
import { extractCssResourceReferences } from '../src/epub/validation/referenceExtractor';
import { sanitizeCssDocument } from '../src/epub/sanitize/sanitizeCss';

describe('cssReferences', () => {
  it('E-015: preserva fallback de fonte e remove só origem perigosa', () => {
    const original = '@font-face{font-family:"F";src:url(data:font/woff2;base64,AAECAw==) format("woff2"),url("javascript:alert(1)") format("woff2");font-display:swap}';
    const result = sanitizeCssDocument('OPS/css/main.css', original, new Set(['OPS/css/main.css']));
    expect(result.changed).toBe(true);
    expect(result.text).toContain('data:font/woff2;base64,AAECAw==');
    expect(result.text).toContain('font-display:swap');
    expect(result.text).not.toContain('javascript:');
    expect(result.text).not.toContain('src:none');
  });

  it('E-015: elimina @font-face sem fonte segura, preservando demais regras', () => {
    const result = sanitizeCssDocument(
      'OPS/css/main.css',
      '@font-face{font-family:"Unsafe";src:url("javascript:alert(1)") format("woff2")}p{color:blue}',
      new Set(['OPS/css/main.css']),
    );
    expect(result.text).not.toContain('@font-face');
    expect(result.text).toContain('p{color:blue}');
  });

  it('E-054: não reescreve URLs em comentários, inclusive exemplos de javascript', () => {
    const original = '/* url("javascript:alert(1)") @import "bad.css"; */' +
      'p{color:blue;background:url("https://cdn.example/img.png")}';
    const result = sanitizeCssDocument('OPS/css/main.css', original,
      new Set(['OPS/css/main.css']));
    expect(result.changed).toBe(false);
    expect(result.text).toBe(original);
  });

  it('E-054: bloqueia CSS ativo disfarçado por escapes sem prometer limpeza', () => {
    const obfuscated = 'p{color:blue;background:u\\72l("javascript:alert(1)")}';
    expect(() => sanitizeCssDocument('OPS/css/main.css', obfuscated,
      new Set(['OPS/css/main.css']))).toThrow(/Revisão manual/u);
  });

  it('E-054: preserva URL HTTPS e remove URL executável direta', () => {
    const original = 'p{background:url("https://cdn.example/img.png")}' +
      '.bad{background:url("javascript:alert(1)")}';
    const cleaned = sanitizeCssDocument('OPS/css/main.css', original,
      new Set(['OPS/css/main.css']));
    expect(cleaned.text).toContain('https://cdn.example/img.png');
    expect(cleaned.text).not.toContain('javascript:');
    expect(cleaned.changed).toBe(true);
  });

  it('detecta url e import', () => {
    const refs = extractCssResourceReferences(
      '@import "base.css"; body{background:url("../img/a.png")}',
    );
    expect(refs.map((ref) => ref.value)).toEqual(
      expect.arrayContaining(['base.css', '../img/a.png']),
    );
  });

  it('neutraliza url ausente', () => {
    const result = sanitizeCssDocument(
      'OPS/css/main.css',
      'body{background:url("../img/missing.png")}',
      new Set(['OPS/css/main.css']),
    );
    expect(result.text).toContain('none');
    expect(result.changed).toBe(true);
  });

  it('preserva import CSS HTTPS e remove somente import ausente', () => {
    const result = sanitizeCssDocument(
      'OPS/css/main.css',
      '@import "https://cdn.example/base.css"; @import "missing.css"; body{color:#111}',
      new Set(['OPS/css/main.css']),
    );
    expect(result.text).toContain('@import "https://cdn.example/base.css"');
    expect(result.text).not.toContain('missing.css');
    expect(result.text).toContain('body{color:#111}');
    expect(result.changed).toBe(true);
  });
});
