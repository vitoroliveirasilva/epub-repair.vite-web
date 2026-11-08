// @vitest-environment jsdom
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { repairEpub } from '../src/epub/repair/repairEpub';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';

beforeAll(() => {
  // JSDOM no Node.js pode não implementar Blob.arrayBuffer diretamente.
  if (typeof Blob.prototype.arrayBuffer === 'function') return;
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error('Blob não legível'));
      reader.readAsArrayBuffer(this);
    });
  };
});

const MIB = 1024 * 1024;
const MAX_FIXTURE_SECONDS = 30;
const MAX_RSS_GROWTH_MIB = 320;

async function fixture(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('META-INF/container.xml',
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/>' +
    '</rootfiles></container>');
  zip.file('OPS/book.opf',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:resource-benchmark</dc:identifier>' +
    '<dc:title>Benchmark sintético</dc:title><dc:language>pt-BR</dc:language>' +
    '<meta property="dcterms:modified">2026-11-05T12:00:00Z</meta>' +
    '</metadata><manifest>' +
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
    '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="asset" href="payload.bin" media-type="application/octet-stream"/>' +
    '</manifest><spine><itemref idref="chapter"/></spine></package>');
  zip.file('OPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" ' +
    'xmlns:epub="http://www.idpf.org/2007/ops">' +
    '<head><title>Índice</title></head><body><nav epub:type="toc"><ol>' +
    '<li><a href="chapter.xhtml#start">Capítulo</a></li></ol></nav></body></html>');
  zip.file('OPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Capítulo</title></head>' +
    '<body><h1 id="start">Texto de referência</h1></body></html>');
  const payload = new Uint8Array(2 * MIB);
  let seed = 13579;
  for (let i = 0; i < payload.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    payload[i] = seed & 0xff;
  }
  zip.file('OPS/payload.bin', payload);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

describe('E-031/E-096: orçamento de recursos em EPUB de 2 MiB', () => {
  it('limita tempo e crescimento amostrado de RSS na leitura e no reparo completos', async () => {
    const source = await fixture();
    const baseline = process.memoryUsage().rss;
    let maximumRss = baseline;
    const sample = () => { maximumRss = Math.max(maximumRss, process.memoryUsage().rss); };
    const started = performance.now();
    // A amostragem não capta picos síncronos sub-25ms: o limite é indicativo.
    const monitor = setInterval(sample, 25);
    try {
      const loaded = await loadEpub('livro.epub', source);
      expect(loaded.validZip).toBe(true);
      expect(loaded.files.get('OPS/payload.bin')?.bytes.length).toBe(2 * MIB);
      const repaired = await repairEpub('livro.epub', source, {
        ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true,
      });
      expect(repaired.changed).toBe(true);
      expect(repaired.after.validZip).toBe(true);
      expect(repaired.after.stats.fatalCount).toBe(0);
    } finally {
      clearInterval(monitor);
      sample();
    }
    const seconds = (performance.now() - started) / 1000;
    const growthMiB = Math.max(0, maximumRss - baseline) / MIB;
    // eslint-disable-next-line no-console -- métrica informativa anexada ao log da CI
    console.info('EPUB benchmark: ' + seconds.toFixed(2) + 's, +' +
      growthMiB.toFixed(1) + ' MiB RSS amostrado');
    expect(seconds).toBeLessThan(MAX_FIXTURE_SECONDS);
    expect(growthMiB).toBeLessThan(MAX_RSS_GROWTH_MIB);
  }, 45_000);
});
