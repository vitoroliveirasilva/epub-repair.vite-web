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
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.locator('.mobile-navigation');
  assert.equal(await mobileMenu.isVisible(), true);
  await mobileMenu.locator('summary').click();
  assert.equal(await mobileMenu.evaluate((node) => node.open), true);
  assert.equal(await mobileMenu.locator('a[href="/"]').count(), 1,
    'Conversor deve oferecer navegação para reparar EPUB');
  assert.equal(await mobileMenu.locator('a[aria-current="page"]').getAttribute('href'), '/converter');
  assert.equal(await mobileMenu.locator('.mobile-navigation-group').count(), 2);
  assert.equal(await mobileMenu.locator('.mobile-navigation-current').textContent(), 'Atual');
  await page.waitForTimeout(320);
  for (const width of [320, 390, 760]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await mobileMenu.locator('.mobile-navigation-panel').evaluate((panel) => {
      const rect = panel.getBoundingClientRect();
      return { left: rect.left, right: rect.right, scroll: panel.scrollWidth,
        inner: panel.clientWidth };
    });
    assert.ok(bounds.left >= -1 && bounds.right <= width + 1,
      'Navegação do conversor deve caber em ' + width + 'px');
    assert.ok(bounds.scroll <= bounds.inner + 2,
      'Navegação do conversor não pode ter rolagem horizontal');
  }
  await page.keyboard.press('Escape');
  assert.equal(await mobileMenu.evaluate((node) => node.open), false);
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.evaluate(() => {
    const seen = new WeakSet();
    window.__converterSpinnerMounts = 0;
    const observer = new MutationObserver(() => {
      const spinner = document.querySelector('.converter-spinner');
      if (spinner && !seen.has(spinner)) {
        seen.add(spinner);
        window.__converterSpinnerMounts += 1;
      }
    });
    observer.observe(document.querySelector('#app'), { childList: true, subtree: true });
  });
  await page.locator('#pdf-file-input').setInputFiles({
    name: 'livro-de-teste.pdf',
    mimeType: 'application/pdf',
    buffer: makePdf(),
  });
  await page.getByText(/Análise concluída:/).waitFor({ timeout: 30000 });
  assert.equal(await page.getByLabel('Título', { exact: true }).inputValue(), 'Livro de teste');
  assert.equal(await page.getByLabel('Autor', { exact: true }).inputValue(), 'EPUB Repair');
  const review = page.locator('.converter-advanced-review');
  await review.locator('summary').click();
  assert.equal(await review.evaluate((el) => el.open), true, 'Revisão avançada deve abrir');
  await page.getByRole('button', { name: 'Adicionar seção depois' }).click();
  assert.equal(await review.evaluate((el) => el.open), true,
    'Revisão avançada deve permanecer aberta ao adicionar capítulo');
  await page.getByLabel('Seção reconstruída').selectOption('0');
  assert.equal(await review.evaluate((el) => el.open), true,
    'Revisão avançada deve permanecer aberta ao trocar capítulo');
  await page.getByRole('button', { name: 'Próxima seção' }).click();
  assert.equal(await review.evaluate((el) => el.open), true,
    'Revisão avançada deve permanecer aberta ao usar navegação de capítulos');
  await page.getByLabel('Página original').selectOption('1');
  assert.equal(await review.evaluate((el) => el.open), true,
    'Revisão avançada deve permanecer aberta ao trocar página');
  await page.getByRole('button', { name: 'Remover seção vazia' }).click();
  assert.equal(await review.evaluate((el) => el.open), true,
    'Revisão avançada deve permanecer aberta após remover capítulo');
  await review.locator('summary').click();
  assert.equal(await review.evaluate((el) => el.open), false);
  await review.locator('summary').click();
  assert.equal(await review.evaluate((el) => el.open), true);

  await page.evaluate(() => {
    const warningPanel = document.querySelector('.converter-warning-panel');
    if (!warningPanel) throw new Error('Card Pontos para conferir não encontrado');
    const longWord = 'CAPITULO_SEM_ESPACOS_OU_QUEBRAS_'.repeat(35);
    for (let index = 0; index < 18; index += 1) {
      const article = document.createElement('article');
      article.className = 'converter-warning converter-warning-warning';
      const strong = document.createElement('strong');
      strong.textContent = 'Ponto para conferir ' + (index + 1);
      const paragraph = document.createElement('p');
      paragraph.textContent = 'Conteúdo do aviso extenso que precisa continuar legível: ' + longWord;
      const small = document.createElement('small');
      small.textContent = 'Página ' + (index + 1);
      article.append(strong, paragraph, small);
      warningPanel.append(article);
    }
  });
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const measured = await page.locator('.converter-warning-panel').evaluate((panel) => {
      const warnings = Array.from(panel.querySelectorAll('.converter-warning'));
      const elements = [panel, ...warnings, ...warnings.flatMap((warning) =>
        Array.from(warning.querySelectorAll('strong, p, small')))];
      const bad = elements.filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > window.innerWidth + 1 ||
          element.scrollWidth > element.clientWidth + 2;
      }).map((element) => ({
        tag: element.tagName,
        className: element.className,
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      const style = getComputedStyle(panel);
      const last = warnings.at(-1);
      return {
        maxHeight: style.maxHeight,
        overflowY: style.overflowY,
        lastVisible: last ? last.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom + 2 : false,
        bad,
      };
    });
    assert.deepEqual(measured.bad, [], 'Card de avisos ultrapassa a largura em ' + width + 'px');
    assert.equal(measured.maxHeight, 'none', 'Card de avisos não pode ter altura máxima fixa');
    assert.equal(measured.lastVisible, true, 'Último aviso precisa estar dentro do card, sem corte');
  }
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.getByLabel('Editora', { exact: true }).fill('Editora de teste');
  await page.getByLabel('Ano ou data de publicação', { exact: true }).fill('2026');
  await page.getByLabel('ISBN', { exact: true }).fill('9788501000002');
  await page.getByLabel('Tradutor', { exact: true }).fill('Tradutora de teste');
  await page.getByRole('button', { name: 'Gerar meu EPUB' }).click();
  await page.getByRole('heading', { name: 'Seu EPUB está pronto para baixar' })
    .waitFor({ timeout: 30000 });
  assert.equal(await page.locator('.converter-result-check').count(), 0,
    'Não deve haver ícone de verificação no card de conversão finalizada');
  const spinnerMounts = await page.evaluate(() => window.__converterSpinnerMounts);
  assert.ok(spinnerMounts <= 3,
    'O indicador de processamento não deve ser recriado a cada página: ' + spinnerMounts);
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
  assert.match(opf ?? '', /urn:isbn:9788501000002/u);
  assert.match(opf ?? '', /<dc:publisher>Editora de teste<\/dc:publisher>/u);
  assert.match(opf ?? '', /marc:relators">trl<\/meta>/u);
  assert.match(nav ?? '', /CAPITULO 1/u);
  assert.match(chapter ?? '', /conversao completa de PDF para EPUB/u);
  assert.deepEqual(errors, []);
  console.log(`PASS converter browser=${selected} file=${download.suggestedFilename()}`);
} finally {
  await context.close();
  await browser.close();
}
