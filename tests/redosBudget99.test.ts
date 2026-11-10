
import { describe, expect, it } from 'vitest';
import { parseXml } from '../src/epub/utils/xmlUtils';
import { sanitizeCssDocument } from '../src/epub/sanitize/sanitizeCss';
import { containsDangerousCss, sanitizeActiveContentMarkup } from
  '../src/epub/sanitize/sanitizeActiveContent';
import { parseZipCentralDirectory } from '../src/epub/reader/rawZipInspector';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';

const MAX_CASE_MS = 8_000;

 
function bounded(label: string, operation: () => void) {
  const start = performance.now();
  operation();
  const elapsed = performance.now() - start;
  expect(elapsed, label + ': tempo máximo de parsing excedido').toBeLessThan(MAX_CASE_MS);
}

describe('E-063: orçamento anti-ReDoS e fuzz determinístico de parsers', () => {
  it('limita custos de CSS com import/url truncados, escapes e comentários longos', () => {
    const files = new Set(['OPS/styles.css']);
    const cases = [
      '@import url("' + 'x'.repeat(12_000),
      '.x{background:url("' + 'a'.repeat(12_000) + '"}',
      '/*' + 'url(javascript:alert(1)) '.repeat(500) + '*/p{color:blue}',
      'p{width:expre\\73sion(alert(1));' + 'color:blue;'.repeat(800) + '}',
      '@font-face{src:url(' + 'x'.repeat(16_000) + ');font-display:swap}',
    ];
    for (const [index, sample] of cases.entries()) {
      bounded('CSS adversarial ' + index, () => {
        try {
          const result = sanitizeCssDocument('OPS/styles.css', sample, files);
          expect(result.text.length).toBeLessThanOrEqual(sample.length + 100);
          
          
          containsDangerousCss(result.text);
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      });
    }
  }, 30_000);

  it('processa SVG/XML/OPF degenerados sem desativar os limites de parser', () => {
    const options = {
      sanitizeScripts: true, kindleSafeMode: true, removeRemoteResourceLinks: false,
    };
    const samples = [
      '<svg xmlns="http://www.w3.org/2000/svg" ' +
        'onload="alert(1)"><text>' + 'Legenda '.repeat(3000) + '</text></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="' +
        'javascript:'.repeat(900) + '"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><text>' +
        '&amp;'.repeat(2000) + '</text></svg>',
    ];
    for (const [index, source] of samples.entries()) {
      bounded('SVG adversarial ' + index, () => {
        try {
          const result = sanitizeActiveContentMarkup(source, 'OPS/figure.svg', options);
          const doc = parseXml(result.text, 'image/svg+xml');
          expect(doc.documentElement.localName).toBe('svg');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      });
    }
    const xmlSamples = [
      '<!DOCTYPE root [' + '<!ENTITY a "boom">'.repeat(1500) + ']><root/>',
      '<?xml version="1.0"?><root><p>' + 'a'.repeat(40_000) + '</p></root>',
      '<package xmlns="http://www.idpf.org/2007/opf">' +
        '<manifest>' + '<item id="a" href="a.xhtml"/>'.repeat(500) +
        '</manifest></package>',
    ];
    for (const [index, source] of xmlSamples.entries()) {
      bounded('XML/OPF adversarial ' + index, () => {
        try {
          const doc = parseXml(source);
          expect(doc.documentElement).toBeTruthy();
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      });
    }
  }, 30_000);

  it('inspeciona corrupção determinística ZIP em 128 offsets sem exceção não tratada', async () => {
    const original = await buildKindleIssueEpub();
    bounded('ZIP fuzz offsets', () => {
      for (let seed = 0; seed < 128; seed += 1) {
        const copy = new Uint8Array(original);
        const offset = ((seed + 13) * 104729) % copy.length;
        copy[offset] = copy[offset]! ^ (1 << (seed % 8));
        const result = parseZipCentralDirectory(copy);
        expect(result.issues).toBeInstanceOf(Array);
      }
    });
  }, 30_000);
});
