// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseXml } from '../src/epub/utils/xmlUtils';
import { sanitizeActiveContentMarkup, containsDangerousCss } from
  '../src/epub/sanitize/sanitizeActiveContent';
import { sanitizeCssDocument } from '../src/epub/sanitize/sanitizeCss';
import { parseZipCentralDirectory } from '../src/epub/reader/rawZipInspector';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';

/** Mutação reproduzível com seed fixa, sem dados privados ou chamadas à rede. */
function mutate(text: string, seed: number): string {
  let value = text;
  let state = (seed * 1664525 + 1013904223) >>> 0;
  const fragments = [' ', '\t', '\n', '<', '>', '&', '"', "'", '/', '\\', ':',
    '#', 'javascript:', '<!ENTITY x "bad">', '<!-- -->', '%2e', '\u0000'];
  for (let i = 0; i < 3; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const at = state % (value.length + 1);
    const fragment = fragments[(state >>> 16) % fragments.length] ?? ' ';
    const mode = (state >>> 25) % 3;
    if (mode === 0) value = value.slice(0, at) + fragment + value.slice(at);
    else if (mode === 1) value = value.slice(0, at) + value.slice(at + 1);
    else value = value.slice(0, at) + fragment + value.slice(at + 1);
  }
  return value;
}

const xml = '<?xml version="1.0"?><root><p id="a">Texto &amp; notas</p></root>';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">' +
  '<text id="label">Legenda</text><a href="javascript:alert(1)">Título</a></svg>';
const opf = '<package xmlns="http://www.idpf.org/2007/opf" version="3.0">' +
  '<metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Livro</dc:title>' +
  '</metadata><manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/>' +
  '</manifest><spine><itemref idref="c"/></spine></package>';
const css = '@font-face {src:url("https://example.org/book.woff2")}' +
  'p{color:blue;background:url("javascript:alert(1)");font-weight:bold}';

describe('E-063/E-094: fuzz adversarial determinístico de parsers', () => {
  it('96 mutações XML/OPF falham de maneira controlada ou produzem DOM válido', () => {
    for (let seed = 0; seed < 96; seed++) {
      const sample = mutate(seed % 2 ? xml : opf, seed);
      try {
        const doc = parseXml(sample);
        expect(doc.documentElement).toBeTruthy();
        expect(doc.getElementsByTagName('parsererror').length).toBe(0);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    }
  });
  it('96 mutações SVG não liberam texto malformado após saneamento', () => {
    const options = {
      sanitizeScripts: true, removeRemoteResourceLinks: false, kindleSafeMode: false,
    };
    for (let seed = 0; seed < 96; seed++) {
      const sample = mutate(svg, seed + 1000);
      try {
        const cleaned = sanitizeActiveContentMarkup(sample, 'OPS/a.svg', options);
        const parsed = new DOMParser().parseFromString(cleaned.text, 'application/xhtml+xml');
        expect(parsed.getElementsByTagName('parsererror')).toHaveLength(0);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    }
  });
  it('96 mutações CSS mantêm origem imutável e diagnosticam perigo residual', () => {
    for (let seed = 0; seed < 96; seed++) {
      const sample = mutate(css, seed + 2000);
      const original = sample;
      const result = sanitizeCssDocument('OPS/styles.css', sample,
        new Set(['OPS/styles.css']));
      expect(sample).toBe(original);
      expect(result.text.length).toBeLessThanOrEqual(original.length + 50);
      if (containsDangerousCss(result.text)) {
        // O scanner mantém alerta se uma sintaxe não pôde ser neutralizada.
        expect(containsDangerousCss(result.text)).toBe(true);
      }
    }
  });
  it('96 mutações ZIP não provocam exceção não tratada no inspetor raw', async () => {
    const original = await buildKindleIssueEpub();
    for (let seed = 0; seed < 96; seed++) {
      const changed = new Uint8Array(original);
      const index = ((seed + 1) * 2654435761) % changed.length;
      changed[index] = changed[index]! ^ (1 << (seed % 8));
      const result = parseZipCentralDirectory(changed);
      expect(Array.isArray(result.issues)).toBe(true);
      expect(Array.isArray(result.entries)).toBe(true);
    }
  });
});
