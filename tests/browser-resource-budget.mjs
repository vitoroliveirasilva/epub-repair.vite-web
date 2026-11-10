import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const harness = process.env.PLAYWRIGHT_MODULE;
assert.ok(harness, 'PLAYWRIGHT_MODULE ausente');
const { chromium } = await import(pathToFileURL(harness).href);
const MiB = 1024 * 1024;






function chromiumResidentMemoryMiB() {
  const data = execFileSync('ps', ['-e', '-o', 'comm=,rss='],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  let totalKiB = 0;
  let processes = 0;
  for (const line of data.split('\n')) {
    const fields = line.trim().match(/^([^\s]+)\s+(\d+)$/u);
    if (!fields || !/(?:chrome|chromium|headless)/iu.test(fields[1])) continue;
    totalKiB += Number(fields[2]);
    processes++;
  }
  return { mib: totalKiB / 1024, processes };
}

const scenarios = [
  { mib: 1, maxMs: 45_000, maxHeapGrowthMiB: 320, maxRssGrowthMiB: 550 },
  { mib: 12, maxMs: 115_000, maxHeapGrowthMiB: 440, maxRssGrowthMiB: 950 },
  { mib: 48, maxMs: 180_000, maxHeapGrowthMiB: 760, maxRssGrowthMiB: 1800 },
  
  
  { mib: 250, maxMs: 300_000, maxHeapGrowthMiB: 1600, maxRssGrowthMiB: 3200 },
];
async function epubFixture(sizeMiB) {
  const zip = new JSZip();
  const parts = sizeMiB <= 128 ? [sizeMiB] : [90, 90, sizeMiB - 180];
  const paths = parts.map((_, index) => sizeMiB <= 128
    ? 'OPS/blob.bin' : 'OPS/blob-' + index + '.bin');
  const resources = paths.map((name, index) =>
    '<item id="binary-' + index + '" href="' + name.slice(4) +
    '" media-type="application/octet-stream"/>').join('');
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
    resources +
    '</manifest><spine><itemref idref="chapter"/></spine></package>');
  zip.file('OPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
    '<head><title>Índice</title></head><body><nav epub:type="toc"><ol>' +
    '<li><a href="chapter.xhtml">Capítulo</a></li></ol></nav></body></html>');
  zip.file('OPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Capítulo</title></head>' +
    '<body><h1>Capítulo grande</h1><p>Preservar arquivo binário</p></body></html>');
  let seed = 0x71a8e123;
  for (let part = 0; part < parts.length; part++) {
    const payload = new Uint8Array(parts[part] * MiB);
    for (let i = 0; i < payload.length; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      
      
      payload[i] = sizeMiB > 128 && ((i >>> 16) & 1) === 0 ? 0 : seed & 255;
    }
    zip.file(paths[part], payload, { compression: 'DEFLATE' });
  }
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
  
  
  
  
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'benchmark-file-input';
    input.hidden = true;
    document.body.append(input);
  });
  for (const { mib, maxMs, maxHeapGrowthMiB, maxRssGrowthMiB } of scenarios) {
    const source = await epubFixture(mib);
    
    
    const dir = await mkdtemp(join(tmpdir(), 'epub-benchmark-'));
    const file = join(dir, 'benchmark-' + mib + '.epub');
    await writeFile(file, source);
    
    
    await page.locator('#benchmark-file-input').setInputFiles(file);
    const baseline = await metrics();
    const baselineRss = chromiumResidentMemoryMiB();
    assert.ok(baselineRss.processes >= 2,
      'Processos Chromium não localizados na medição RSS');
    let peak = baseline;
    let peakRss = baselineRss.mib;
    const timer = setInterval(() => {
      peakRss = Math.max(peakRss, chromiumResidentMemoryMiB().mib);
      void metrics().then((heap) => { peak = Math.max(peak, heap); })
        .catch(() => {});
    }, 250);
    const started = performance.now();
    try {
      const result = await page.evaluate(async () => {
        const [{ loadEpubInWorker }, { repairEpub }, { DEFAULT_REPAIR_OPTIONS }] =
          await Promise.all([
            import('/src/app/zipWorkerClient.ts'),
            import('/src/epub/repair/repairEpub.ts'),
            import('/src/epub/utils/constants.ts'),
          ]);
        const input = document.querySelector('#benchmark-file-input');
        if (!(input instanceof HTMLInputElement) || !input.files?.[0]) {
          throw new Error('Fixture não foi carregada no browser');
        }
        const bytes = new Uint8Array(await input.files[0].arrayBuffer());
        let ticks = 0;
        const heartbeat = setInterval(() => { ticks += 1; }, 50);
        try {
          const zip = await loadEpubInWorker('large.epub', bytes);
          if (!zip.validZip) throw new Error('Worker não abriu ZIP sintético');
          const originalBytes = [...zip.files]
            .filter(([path]) => /^OPS\/blob(?:-\d+)?\.bin$/u.test(path))
            .reduce((sum, [, entry]) => sum + entry.bytes.length, 0);
          const expected = Number(input.files[0].name.match(/benchmark-(\d+)\.epub/u)?.[1])
            * 1024 * 1024;
          if (!Number.isFinite(expected) || !originalBytes ||
              originalBytes !== expected) {
            throw new Error('Recurso binário não foi extraído integralmente');
          }
          const repaired = await repairEpub('large.epub', bytes, {
            ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true,
          }, 'repair', zip);
          if (!repaired.blob || !repaired.changed ||
              !repaired.after.validZip || repaired.after.stats.fatalCount) {
            throw new Error('Reparo não preservou arquivo maior');
          }
          return { outputBytes: repaired.blob.size, heartbeatTicks: ticks,
            inputBytes: bytes.length, resourceBytes: originalBytes };
        } finally {
          clearInterval(heartbeat);
        }
      });
      const elapsed = performance.now() - started;
      peak = Math.max(peak, await metrics());
      const growth = Math.max(0, peak - baseline) / MiB;
      peakRss = Math.max(peakRss, chromiumResidentMemoryMiB().mib);
      const rssGrowth = Math.max(0, peakRss - baselineRss.mib);
      assert.ok(rssGrowth < maxRssGrowthMiB,
        'EPUB ' + mib + ' MiB passou do orçamento RSS Chromium: +' +
        rssGrowth.toFixed(1) + ' MiB (máximo ' + maxRssGrowthMiB + ')');
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
        growth.toFixed(1) + 'MiB JS heap main, +' +
        rssGrowth.toFixed(1) + 'MiB RSS Chromium processes, heartbeat=' +
        result.heartbeatTicks + ', output=' + result.outputBytes);
    } finally {
      clearInterval(timer);
      await page.locator('#benchmark-file-input').setInputFiles([]);
      await rm(dir, { recursive: true, force: true });
    }
  }
} finally {
  await session.detach();
  await context.close();
  await browser.close();
}
