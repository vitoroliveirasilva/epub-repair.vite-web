import { describe, expect, it } from 'vitest';
import { extractCssResourceReferences } from '../src/epub/validation/referenceExtractor';
import { sanitizeCssDocument } from '../src/epub/sanitize/sanitizeCss';

describe('cssReferences', () => {
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
});
