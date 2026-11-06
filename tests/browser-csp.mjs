import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Testa a política real da versão netlify.toml em todos os engines Playwright.
// Header é reproduzido no browser em localhost, sem alegar deploy Netlify.
const config = readFileSync('netlify.toml', 'utf8');
const policy = /Content-Security-Policy\s*=\s*"([^"]+)"/u.exec(config)?.[1];
assert.ok(policy, 'Política CSP não encontrada no netlify.toml');
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
  await page.route('http://127.0.0.1:5173/', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': policy },
    });
  });

  const response = await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  assert.equal(response?.headers()['content-security-policy'], policy);
  await page.getByRole('heading', { name: /Conserte arquivos EPUB/u }).waitFor();
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

    // Deve ser possível carregar script de Worker de mesma origem.
    const workerAllowed = await new Promise((resolve) => {
      let settled = false;
      let worker;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        worker?.terminate();
        resolve(value);
      };
      const timer = setTimeout(() => finish(false), 10000);
      try {
        worker = new Worker(new URL('/src/app/zipLoadWorker.ts', location.href),
          { type: 'module' });
        worker.onmessage = (e) => {
          if (e.data?.type === 'loaded') {
            clearTimeout(timer);
            finish(true);
          }
          if (e.data?.type === 'error') {
            clearTimeout(timer);
            finish(false);
          }
        };
        worker.onerror = () => { clearTimeout(timer); finish(false); };
        worker.postMessage({
          type: 'load', fileName: 'invalid.epub',
          bytes: new Uint8Array([0x50, 0x4b]),
        });
      } catch {
        clearTimeout(timer);
        finish(false);
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      injected: Boolean(window.__CSP_MARKER__),
      dataImage, blobImage, remoteBlocked, workerAllowed, violations,
    };
  });
  assert.equal(outcome.injected, false, 'script inline não foi bloqueado pelo CSP');
  assert.equal(outcome.dataImage, true, 'data:image/png bloqueado pelo CSP');
  assert.equal(outcome.blobImage, true, 'blob:image/png bloqueado pelo CSP');
  assert.equal(outcome.remoteBlocked, true, 'connect-src permitiu origem remota');
  assert.equal(outcome.workerAllowed, true, 'worker-src bloqueou Worker self');
  assert.ok(outcome.violations.some((v) => /script-src/iu.test(v.directive)),
    'Não foi observada violação de CSP no script inline');
  assert.ok(outcome.violations.some((v) => /connect-src/iu.test(v.directive)),
    'Não foi observada violação de CSP ao tentar conexão externa');

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 12000 }),
    page.evaluate(async () => {
      const { downloadBlob } = await import('/src/ui/dom.ts');
      downloadBlob(new Blob(['CSP EPUB OK'], { type: 'text/plain' }), 'csp-check.txt');
    }),
  ]);
  assert.equal(download.suggestedFilename(), 'csp-check.txt');
  assert.deepEqual(errors, [], 'Erro não tratado ao carregar sob CSP');
  console.log('PASS E-062 CSP enforce ' + engineName + ' data/blob/worker/download' +
    ' remote-blocked/inline-blocked');
  await context.close();
} finally {
  await browser.close();
}
