// @vitest-environment jsdom
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { repairEpub } from '../src/epub/repair/repairEpub';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { DEFAULT_REPAIR_OPTIONS, EPUB_MIME } from '../src/epub/utils/constants';

beforeAll(() => {
  if (typeof Blob.prototype.arrayBuffer === 'function') return;
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error('Blob inválido'));
      reader.readAsArrayBuffer(this);
    });
  };
});

async function book(index: number, withMimetype: boolean): Promise<Uint8Array> {
  const zip = new JSZip();
  if (withMimetype) zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
  zip.file('META-INF/container.xml',
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
      '<rootfiles><rootfile full-path="OPS/content.opf" ' +
      'media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OPS/content.opf',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">' +
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      '<dc:identifier id="id">urn:uuid:test-epub-' + index + '</dc:identifier>' +
      '<dc:title>Obra ' + index + '</dc:title><dc:language>pt-BR</dc:language>' +
      '<meta property="dcterms:modified">2026-11-05T12:00:00Z</meta>' +
      '</metadata><manifest>' +
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
      '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
      '</manifest><spine><itemref idref="chapter"/></spine></package>');
  zip.file('OPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" ' +
      'lang="pt-BR"><head><title>Sumário</title></head><body>' +
      '<nav epub:type="toc"><ol><li><a href="chapter.xhtml#inicio">Capítulo</a></li></ol></nav>' +
      '</body></html>');
  zip.file('OPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR">' +
      '<head><title>Capítulo</title></head><body><h1 id="inicio">Capítulo ' + index +
      '</h1><p>Palavras preservadas: café, edição, livro número ' + index +
      '. Símbolos: &amp; — “texto”.</p></body></html>');
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

describe('E-093: propriedades de no-op e idempotência em EPUB 3', () => {
  it('12 EPUBs válidos não sofrem reparo, nem byte, nem criação de arquivo', async () => {
    for (let seed = 0; seed < 12; seed += 1) {
      const source = await book(seed, true);
      const snapshot = new Uint8Array(source);
      const result = await repairEpub('Livro.epub', source);
      expect(result.changed, 'seed=' + seed).toBe(false);
      expect(result.blob, 'seed=' + seed).toBeUndefined();
      expect(source, 'seed=' + seed).toEqual(snapshot);
      expect(result.before.stats.fatalCount, 'seed=' + seed).toBe(0);
      expect(result.after).toEqual(result.before);
    }
  }, 20_000);

  it('8 EPUBs sem mimetype podem ser reparados apenas uma vez', async () => {
    for (let seed = 0; seed < 8; seed += 1) {
      const source = await book(seed, false);
      const inspected = await inspectEpub('Livro.epub', source);
      expect(inspected.issues.some((issue) => issue.code === 'MIME_MISSING')).toBe(true);
      const first = await repairEpub('Livro.epub', source, {
        ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true,
      });
      expect(first.changed, 'seed=' + seed).toBe(true);
      expect(first.blob, 'seed=' + seed).toBeDefined();
      const produced = new Uint8Array(await first.blob!.arrayBuffer());
      const snapshot = new Uint8Array(produced);
      const second = await repairEpub(first.fileName, produced, {
        ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true,
      });
      expect(second.changed, 'seed=' + seed).toBe(false);
      expect(second.blob, 'seed=' + seed).toBeUndefined();
      expect(produced, 'seed=' + seed).toEqual(snapshot);
      expect(second.before.stats.fatalCount, 'seed=' + seed).toBe(0);
    }
  }, 30_000);
});
