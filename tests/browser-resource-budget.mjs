import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { pathToFileURL } from 'node:url';

const harness = process.env.PLAYWRIGHT_MODULE;
assert.ok(harness, 'PLAYWRIGHT_MODULE ausente');
const { chromium } = await import(pathToFileURL(harness).href);
const MiB = 1024 * 1024;
const scenarios = [
  { mib: 1, maxMs: 45_000, maxHeapGrowthMiB: 320 },
  { mib: 12, maxMs: 115_000, maxHeapGrowthMiB: 440 },
];
async function epubFixture(sizeMiB) {
  const zip = new JSZip();
  zip.file('META-INF/container.xml',
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/>' +
    '</rootfiles></container>');
  zip.file('OPS/book.opf',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="id">urn:uuid:resource-' + sizeMiB + '</dc:identifier>' +
    '<dc:title>Orçamento de RAM</dc:title><dc:language>pt-BR</dc:language>' +
    '<meta property="dcterms:modified">2026-11-05T15:00:00Z</meta>' +
    '</metadata><manifest>' +
    '<item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>' +
    '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="binary" href="blob.bin" media-type="application/octet-stream"/>' +
    '</manifest><spine><itemref idref="chapter"/></spine></package>');
  zip.file('OPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
    '<head><title>Índice</title></head><body><nav epub:type="toc"><ol>' +
    '<li><a href="chapter.xhtml">Capítulo</a></li></ol></nav></body></html>');
  zip.file('OPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Capítulo</title></head>' +
    '<body><h1>Capítulo grande</h1><p>Preservar arquivo binário</p></body></html>');
  const payload = new Uint8Array(sizeMiB * MiB);
  let seed = 0x71a8e123;
  for (let i = 0; i < payload.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    payload[i] = seed & 255;
  }
  zip.file('OPS/blob.bin', payload, { compression: 'DEFLATE' });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
const browser = await chromium.launch({ headless: true,
  args: ['--enable-precise-memory-info'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const session = await context.newCDPSession(page);
const metrics = async () => {
  const report = await session.send('Performance.getMetrics');
  return report.metrics.find((entry) => entry.name === 'JSHeapUsedSize')?.value ?? 0;
};
await session.send('Performance.enable');
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' });
  for (const { mib, maxMs, maxHeapGrowthMiB } of scenarios) {
    const source = await epubFixture(mib);
    const baseline = await metrics();
    let peak = baseline;
    const timer = setInterval(() => {
      void metrics().then((heap) => { peak = Math.max(peak, heap); })
        .catch(() => {});
    }, 250);
    const started = performance.now();
    try {
      const result = await page.evaluate(async (raw) => {
        const [{ loadEpubInWorker }, { repairEpub }, { DEFAULT_REPAIR_OPTIONS }] =
          await Promise.all([
            import('/src/app/zipWorkerClient.ts'),
            import('/src/epub/repair/repairEpub.ts'),
            import('/src/epub/utils/constants.ts'),
          ]);
        const bytes = Uint8Array.from(raw);
        let ticks = 0;
        const heartbeat = setInterval(() => { ticks += 1; }, 50);
        try {
          const zip = await loadEpubInWorker('large.epub', bytes);
          if (!zip.validZip) throw new Error('Worker não abriu ZIP sintético');
          const original = zip.files.get('OPS/blob.bin')?.bytes;
          if (!original || ![1 * 1024 * 1024, 12 * 1024 * 1024]
              .includes(original.length)) {
            throw new Error('Recurso binário não foi extraído');
          }
          const repaired = await repairEpub('large.epub', bytes, {
            ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true,
          }, 'repair', zip);
          if (!repaired.blob || !repaired.changed ||
              !repaired.after.validZip || repaired.after.stats.fatalCount) {
            throw new Error('Reparo não preservou arquivo maior');
          }
          return { outputBytes: repaired.blob.size, heartbeatTicks: ticks,
            inputBytes: bytes.length, resourceBytes: original.length };
        } finally {
          clearInterval(heartbeat);
        }
      }, Array.from(source));
      const elapsed = performance.now() - started;
      peak = Math.max(peak, await metrics());
      const growth = Math.max(0, peak - baseline) / MiB;
      assert.ok(elapsed < maxMs,
        'EPUB ' + mib + ' MiB excedeu ' + maxMs + 'ms: ' + elapsed.toFixed(0));
      assert.ok(growth < maxHeapGrowthMiB,
        'EPUB ' + mib + ' MiB passou de ' + maxHeapGrowthMiB +
        'MiB de crescimento de heap principal: ' + growth.toFixed(1));
      assert.ok(result.heartbeatTicks > 0, 'Worker congelou toda a UI');
      assert.ok(result.outputBytes > 1000);
      assert.equal(result.resourceBytes, mib * MiB);
      console.log('PASS E-031/E-096 Chromium EPUB ' + mib +
        ' MiB, ' + elapsed.toFixed(0) + 'ms, +' +
        growth.toFixed(1) + 'MiB JS heap main, heartbeat=' +
        result.heartbeatTicks + ', output=' + result.outputBytes);
    } finally {
      clearInterval(timer);
    }
  }
} finally {
  await session.detach();
  await context.close();
  await browser.close();
}
