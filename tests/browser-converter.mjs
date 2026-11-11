import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';

const playwrightPath = process.env.PLAYWRIGHT_MODULE;
assert.ok(playwrightPath, 'PLAYWRIGHT_MODULE não configurado');
const playwright = await import(pathToFileURL(playwrightPath).href);
const selected = process.env.BROWSER ?? 'chromium';
const engine = { chromium: playwright.chromium, firefox: playwright.firefox, webkit: playwright.webkit }[selected];
assert.ok(engine, 'Navegador não suportado: ' + selected);

function makePdf() {
  const stream = [
    'BT',
    '/F1 24 Tf',
    '72 700 Td',
    '(CAPITULO 1) Tj',
    '/F1 12 Tf',
    '0 -42 Td',
    '(Este documento verifica a conversao completa de PDF para EPUB no navegador.) Tj',
    '0 -22 Td',
    '(O texto precisa permanecer legivel, navegavel e presente no arquivo final.) Tj',
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Title (Livro de teste) /Author (EPUB Repair) >>',
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

const browser = await engine.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
  const response = await page.goto('http://127.0.0.1:5173/converter', { waitUntil: 'networkidle' });
  assert.equal(response?.status(), 200);
  await page.getByRole('heading', { name: /Transforme PDF em EPUB/ }).waitFor();
  await page.locator('#pdf-file-input').setInputFiles({
    name: 'livro-de-teste.pdf',
    mimeType: 'application/pdf',
    buffer: makePdf(),
  });
  await page.getByText(/Análise concluída:/).waitFor({ timeout: 30000 });
  assert.equal(await page.getByLabel('Título', { exact: true }).inputValue(), 'Livro de teste');
  assert.equal(await page.getByLabel('Autor', { exact: true }).inputValue(), 'EPUB Repair');
  await page.getByRole('button', { name: 'Gerar EPUB validado' }).click();
  await page.getByRole('heading', { name: 'Conversão concluída e validada' })
    .waitFor({ timeout: 30000 });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: 'Baixar EPUB convertido' }).click(),
  ]);
  const path = await download.path();
  assert.ok(path);
  const zip = await JSZip.loadAsync(await readFile(path));
  const opf = await zip.file('OEBPS/content.opf')?.async('text');
  const nav = await zip.file('OEBPS/nav.xhtml')?.async('text');
  const chapter = await zip.file('OEBPS/Text/section-001.xhtml')?.async('text');
  assert.match(opf ?? '', /Livro de teste/u);
  assert.match(nav ?? '', /CAPITULO 1/u);
  assert.match(chapter ?? '', /conversao completa de PDF para EPUB/u);
  assert.deepEqual(errors, []);
  console.log(`PASS converter browser=${selected} file=${download.suggestedFilename()}`);
} finally {
  await context.close();
  await browser.close();
}
