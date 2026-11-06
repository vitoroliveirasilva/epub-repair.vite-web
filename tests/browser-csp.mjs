import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Testa a política real da versão netlify.toml em todos os engines Playwright.
// Header é reproduzido no browser em localhost, sem alegar deploy Netlify.
const config = readFileSync('netlify.toml', 'utf8');
const policy = /Content-Security-Policy\s*=\s*"([^"]+)"/u.exec(config)?.[1];
assert.ok(policy, 'Política CSP não encontrada no netlify.toml');
// Em HTTP 127.0.0.1 o upgrade-insecure-requests promove os assets para HTTPS
// sem servidor TLS. Remover SOMENTE a diretiva de upgrade do harness localhost;
// ela continua ativa e intacta na configuração Netlify de produção (HTTPS).
const localhostPolicy = policy.split(';').map((value) => value.trim())
  .filter((value) => value !== 'upgrade-insecure-requests').join('; ');
assert.ok(policy.includes('upgrade-insecure-requests'));
assert.equal(localhostPolicy.includes('upgrade-insecure-requests'), false);
const modulePath = process.env.PLAYWRIGHT_MODULE;
assert.ok(modulePath, 'PLAYWRIGHT_MODULE ausente');
const { chromium, firefox, webkit } = await import(pathToFileURL(modulePath).href);
const engineName = process.env.BROWSER ?? 'chromium';
const engine = { chromium, firefox, webkit }[engineName];
assert.ok(engine, 'Navegador não reconhecido: ' + engineName);
const browser = await engine.launch({ headless: true });
const errors = [];
try {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  page.on('requestfailed', (req) => errors.push(
    'request: ' + req.url() + ' ' + req.failure()?.errorText));
  const observedWorkers = [];
  page.on('worker', (worker) => observedWorkers.push(worker.url()));
  await page.route('http://127.0.0.1:4173/', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': localhostPolicy },
    });
  });

  const response = await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  assert.equal(response?.headers()['content-security-policy'], localhostPolicy);
  try {
    await page.getByRole('heading', { name: /Conserte arquivos EPUB/u })
      .waitFor({ timeout: 15000 });
  } catch (error) {
    throw new Error('CSP impediu carregar app de produção em ' + engineName +
      ': ' + errors.join(' | ') + ' HTML=' + (await page.content()).slice(0,900),
      { cause: error });
  }
  // EPUB válido e local: o bundle de produção precisa iniciar Worker real.
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml',
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/>' +
    '</rootfiles></container>');
  zip.file('OPS/book.opf',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:csp-test</dc:identifier>' +
    '<dc:title>CSP local</dc:title><dc:language>pt-BR</dc:language>' +
    '<meta property="dcterms:modified">2026-11-05T12:00:00Z</meta>' +
    '</metadata><manifest>' +
    '<item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>' +
    '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
    '</manifest><spine><itemref idref="chapter"/></spine></package>');
  zip.file('OPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
    '<head><title>Sumário</title></head><body><nav epub:type="toc">' +
    '<ol><li><a href="chapter.xhtml">Capítulo</a></li></ol></nav></body></html>');
  zip.file('OPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Capítulo</title></head>' +
    '<body><h1>Leitura segura</h1><p>Texto local.</p></body></html>');
  await page.locator('#epub-file-input').setInputFiles({
    name: 'csp.epub', mimeType: 'application/epub+zip',
    buffer: Buffer.from(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })),
  });
  await page.waitForFunction(() => document.querySelector('.report-panel') &&
    document.querySelector('.controls-panel')?.getAttribute('aria-busy') === 'false',
  undefined, { timeout: 25000 });
  assert.ok(observedWorkers.length > 0,
    'O app de produção não iniciou Worker com worker-src self');
  const outcome = await page.evaluate(async () => {
    const violations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      violations.push({ directive: e.violatedDirective, blocked: e.blockedURI });
    });
    // Um script inline inserido no DOM NÃO pode executar sob script-src 'self'.
    const element = document.createElement('script');
    element.textContent = 'window.__CSP_MARKER__ = 1;';
    document.head.append(element);
    element.remove();
    // Dados raster passivos devem funcionar, tanto em data: quanto em blob:.
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNImXbiPwAF5gLCP3lq6QAAAABJRU5ErkJggg==';
    const raw = Uint8Array.from(atob(png), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([raw], { type: 'image/png' }));
    const testImage = (src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth === 1 && img.naturalHeight === 1);
      img.onerror = () => resolve(false);
      img.src = src;
    });
    let dataImage = false;
    let blobImage = false;
    try {
      dataImage = await testImage('data:image/png;base64,' + png);
      blobImage = await testImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    // connect-src 'self': nunca tentar acesso externo real para EPUBs locais.
    let remoteBlocked = false;
    try {
      await fetch('https://example.invalid/epub-csp-probe', {
        mode: 'cors', cache: 'no-store',
      });
    } catch {
      remoteBlocked = true;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      injected: Boolean(window.__CSP_MARKER__),
      dataImage, blobImage, remoteBlocked, violations,
    };
  });
  assert.equal(outcome.injected, false, 'script inline não foi bloqueado pelo CSP');
  assert.equal(outcome.dataImage, true, 'data:image/png bloqueado pelo CSP');
  assert.equal(outcome.blobImage, true, 'blob:image/png bloqueado pelo CSP');
  assert.equal(outcome.remoteBlocked, true, 'connect-src permitiu origem remota');
  assert.ok(outcome.violations.some((v) => /script-src/iu.test(v.directive)),
    'Não foi observada violação de CSP no script inline');
  assert.ok(outcome.violations.some((v) => /connect-src/iu.test(v.directive)),
    'Não foi observada violação de CSP ao tentar conexão externa');

  const summary = page.locator('summary').filter({ hasText: 'Relatório técnico' });
  await summary.click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 12000 }),
    page.getByRole('button', { name: 'JSON', exact: true }).click(),
  ]);
  assert.match(download.suggestedFilename(), /\.json$/u);
  // As duas violações intencionais abaixo devem ser registradas no console;
  // nenhuma exceção de aplicação é aceitável.
  assert.deepEqual(errors.filter((e) => !/Content Security Policy|Content-Security-Policy|Refused to|Load denied by X-Frame-Options|example\.invalid|Content blocker|because it violates|violates the following/u.test(e)), [],
    'Erro inesperado na aplicação com CSP');
  console.log('PASS E-062 CSP enforce ' + engineName + ' data/blob/worker/download' +
    ' remote-blocked/inline-blocked');
  await context.close();
} finally {
  await browser.close();
}
