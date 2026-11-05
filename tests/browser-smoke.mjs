import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { chromium, firefox, webkit } from 'playwright';

const browsers = { chromium, firefox, webkit };
const selected = process.env.BROWSER ?? 'chromium';
const engine = browsers[selected];
assert.ok(engine, 'Browser engine unsupported: ' + selected);

async function syntheticEpub() {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml',
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" ' +
    'media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OPS/book.opf',
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uuid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:title>Fixture de navegador</dc:title><dc:language>pt-BR</dc:language>' +
    '<dc:identifier id="uuid">urn:uuid:browser-smoke-99</dc:identifier>' +
    '<meta property="dcterms:modified">2026-11-05T12:00:00Z</meta></metadata>' +
    '<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" ' +
    'properties="nav"/><item id="ch" href="chapter.xhtml" ' +
    'media-type="application/xhtml+xml"/></manifest>' +
    '<spine><itemref idref="ch"/></spine></package>');
  zip.file('OPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" ' +
    'xmlns:epub="http://www.idpf.org/2007/ops">' +
    '<head><title>Sumário</title></head><body><nav epub:type="toc"><ol>' +
    '<li><a href="chapter.xhtml">Capítulo</a></li></ol></nav></body></html>');
  zip.file('OPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Teste</title></head>' +
    '<body><h1>Capítulo teste</h1><p>Texto da fixture.</p></body></html>');
  return Buffer.from(await zip.generateAsync({
    type: 'uint8array', compression: 'DEFLATE',
  }));
}

async function scenario(browser, mobile) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1365, height: 768 },
    ...(mobile && selected !== 'firefox'
      ? { isMobile: true, deviceScaleFactor: 2, hasTouch: true } : {}),
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const unhandled = [];
  page.on('pageerror', (err) => unhandled.push(err.message));
  try {
    const response = await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200);
    await page.getByRole('heading', { name: /Conserte arquivos EPUB/ }).waitFor();
    await page.getByRole('button', { name: 'Alternar tema claro e escuro' }).click();
    assert.ok(await page.locator('html[data-theme="dark"]').count() +
      await page.locator('html[data-theme="light"]').count() > 0);

    const bytes = await syntheticEpub();
    await page.locator('#epub-file-input').setInputFiles({
      name: 'browser-smoke.epub', mimeType: 'application/epub+zip',
      buffer: bytes,
    });
    await page.getByText('EPUB carregado com segurança').waitFor({ timeout: 20000 });
    await page.waitForFunction(() => {
      const workspace = document.querySelector('.controls-panel');
      const report = document.querySelector('.report-panel');
      return workspace?.getAttribute('aria-busy') === 'false' && Boolean(report);
    }, undefined, { timeout: 25000 });

    const technical = page.locator('summary').filter({ hasText: 'Relatório técnico' });
    await technical.click();
    const json = page.getByRole('button', { name: 'JSON', exact: true });
    await json.waitFor({ state: 'visible' });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 12000 }),
      json.click(),
    ]);
    assert.match(download.suggestedFilename(), /\.json$/);
    assert.deepEqual(unhandled, [], 'Unhandled browser errors: ' + unhandled.join('; '));
    console.log('PASS browser=' + selected + ' mobile=' + mobile +
      ' report=' + download.suggestedFilename());
  } finally {
    await context.close();
  }
}

const browser = await engine.launch({ headless: true });
try {
  await scenario(browser, false);
  await scenario(browser, true);
} finally {
  await browser.close();
}
