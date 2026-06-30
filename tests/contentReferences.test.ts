import { describe, expect, it } from 'vitest';
import { extractHtmlResourceReferences } from '../src/epub/validation/referenceExtractor';

describe('extractHtmlResourceReferences', () => {
  it('extrai imagens, links, srcset e kindle embed', () => {
    const refs = extractHtmlResourceReferences(
      '<img src="img/capa.jpg"><a href="https://example.com">x</a><img srcset="a.jpg 1x, b.jpg 2x">kindle:embed:0001',
    );
    expect(refs.map((ref) => ref.value)).toEqual(
      expect.arrayContaining([
        'img/capa.jpg',
        'https://example.com',
        'a.jpg',
        'b.jpg',
        'kindle:embed:0001',
      ]),
    );
  });
});
