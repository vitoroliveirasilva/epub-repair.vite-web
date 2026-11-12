import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';


const playwrightPath = process.env.PLAYWRIGHT_MODULE;
assert.ok(playwrightPath, 'PLAYWRIGHT_MODULE não configurado');
const { chromium, firefox, webkit } = await import(pathToFileURL(playwrightPath).href);

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

async function mobileReviewLayoutSmoke(page) {
  await page.evaluate(async () => {
    const [{ renderIssueList }, { renderRepairSummary }] = await Promise.all([
      import('/src/ui/components/IssueList.ts'),
      import('/src/ui/components/RepairSummary.ts'),
    ]);
    const file = 'OPS/Text/' + 'capitulo-com-um-nome-bastante-extenso/'.repeat(7) + 'conteudo.xhtml';
    const report = {
      fileName: 'livro-de-teste.epub',
      validZip: true,
      issues: [
        {
          id: 'manual', code: 'CONTENT_MISSING_RESOURCE', severity: 'error', repairable: false,
          title: 'Um recurso importante não foi encontrado dentro do EPUB',
          detail: 'Esta ocorrência exige que você confira o arquivo de origem e os vínculos internos.',
          context: 'O caminho é muito longo e precisa ser legível sem provocar rolagem horizontal.',
          file,
        },
        {
          id: 'warning', code: 'PACKAGE_DECLARED_SCRIPT', severity: 'warning', repairable: false,
          title: 'Conteúdo interativo precisa ser conferido manualmente',
          detail: 'Verifique se o comportamento editorial original continua funcionando.',
          file,
        },
        {
          id: 'repair', code: 'MIME_MISSING', severity: 'warning', repairable: true,
          title: 'Arquivo de identificação pode ser reconstruído automaticamente',
          detail: 'O reparo automático pode tentar resolver esse problema.',
          file: 'mimetype',
        },
      ],
      stats: {
        kindleScore: 77, fatalCount: 0, errorCount: 1, warningCount: 2,
        infoCount: 0, repairableCount: 1,
      },
    };
    const host = document.createElement('div');
    host.className = 'mobile-report-visual-test';
    host.style.minWidth = '0';
    host.dataset.mobileReportVisualTest = 'true';
    const workspace = document.querySelector('.workspace');
    if (!workspace) throw new Error('Área principal do EPUB não encontrada');
    workspace.append(host);
    const simple = renderIssueList(report, 'simple', () => undefined);
    const technical = renderIssueList(report, 'technical', () => undefined);
    const result = renderRepairSummary({
      before: report, after: report, fileName: 'livro.epub',
      changed: true, operation: 'repair', warnings: [],
      actions: [{ type: 'skipped', title: 'Ação manual',
        detail: 'Referência suspeita requer conferência.', file }],
    });
    host.append(simple, technical, result);
    for (const details of host.querySelectorAll('details')) details.open = true;
    if (!simple.querySelector('.manual-review-cta')) {
      throw new Error('Botão da conferência manual não renderizado');
    }
    if (!simple.querySelector('.simple-issue-location code')) {
      throw new Error('Local da ocorrência não renderizado no modo simples');
    }
  });
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const fontSize of [16, 20]) {
      const violations = await page.evaluate((size) => {
        document.documentElement.style.fontSize = size + 'px';
        const selector = [
          '.mobile-report-visual-test .issues-panel',
          '.mobile-report-visual-test .repair-summary',
          '.mobile-report-visual-test .manual-review-notice',
          '.mobile-report-visual-test .simple-issue',
          '.mobile-report-visual-test .issue',
          '.mobile-report-visual-test .issue-group > summary',
          '.mobile-report-visual-test .simple-issue-location code',
          '.mobile-report-visual-test .issue-meta code',
          '.mobile-report-visual-test .repair-pending-item',
          '.mobile-report-visual-test .manual-review-cta',
        ].join(',');
        return Array.from(document.querySelectorAll(selector)).flatMap((node) => {
          const rect = node.getBoundingClientRect();
          const right = window.innerWidth;
          if (rect.width === 0 || rect.height === 0) return [];
          if (rect.left < -2 || rect.right > right + 2 ||
              node.scrollWidth > node.clientWidth + 3) {
            return [{
              node: node.className || node.tagName,
              left: Math.round(rect.left), right: Math.round(rect.right),
              viewport: right,
              scrollWidth: node.scrollWidth,
              clientWidth: node.clientWidth,
            }];
          }
          return [];
        });
      }, fontSize);
      assert.deepEqual(violations, [],
        'Layout do relatório sai da tela em ' + width + 'px com fonte ' + fontSize + 'px');
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('font-size');
    document.querySelector('.mobile-report-visual-test')?.remove();
  });
  console.log('PASS report mobile visual layout browser=' + selected +
    ' widths=320,360,390,430 font-size=16,20');
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
    if (mobile && selected === 'chromium') await mobileReviewLayoutSmoke(page);
    assert.deepEqual(unhandled, [], 'Unhandled browser errors: ' + unhandled.join('; '));
    console.log('PASS browser=' + selected + ' mobile=' + mobile +
      ' report=' + download.suggestedFilename());
  } finally {
    await context.close();
  }
}


const samplePng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNImXbiPwAF5gLCP3lq6QAAAABJRU5ErkJggg==';
const progressiveJpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wgARCAAQABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAABgf/xAAVAQEBAAAAAAAAAAAAAAAAAAABA//aAAwDAQACEAMQAAABjThc4k//xAAWEAADAAAAAAAAAAAAAAAAAAAABAX/2gAIAQEAAQUCTkicoTlCco//xAAXEQEAAwAAAAAAAAAAAAAAAAAFACEx/9oACAEDAQE/AQH8uf/EABURAQEAAAAAAAAAAAAAAAAAAAMA/9oACAECAQE/ATa//8QAFRABAQAAAAAAAAAAAAAAAAAAADH/2gAIAQEABj8CiIj/xAAVEAEBAAAAAAAAAAAAAAAAAAAAMf/aAAgBAQABPyGDFixf/9oADAMBAAIAAwAAABAT/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxBf/8QAFREBAQAAAAAAAAAAAAAAAAAAAGH/2gAIAQIBAT8Qu//EABUQAQEAAAAAAAAAAAAAAAAAAADx/9oACAEBAAE/EISMjIz/2Q==';





async function syntheticPresentationEpub() {
  const zip = new JSZip();
  zip.file('META-INF/container.xml',
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/>' +
    '</rootfiles></container>');
  zip.file('OPS/book.opf',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:visual-smoke</dc:identifier>' +
    '<dc:title>Fixture visual</dc:title><dc:language>pt-BR</dc:language>' +
    '<meta property="dcterms:modified">2026-11-05T12:00:00Z</meta>' +
    '</metadata><manifest>' +
    '<item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>' +
    '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="fixed" href="fixed.xhtml" media-type="application/xhtml+xml"/>' +
    '</manifest><spine><itemref idref="chapter"/><itemref idref="fixed"/></spine></package>');
  zip.file('OPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
    '<head><title>Sumário</title></head><body>' +
    '<nav epub:type="toc"><ol><li><a href="chapter.xhtml">Capítulo</a></li>' +
    '<li><a href="fixed.xhtml">Prancha</a></li></ol></nav></body></html>');
  const chapter = '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Capítulo</title>' +
    '<style>body{max-width:650px;margin:0 auto;font-family:Georgia,serif}' +
    'p{line-height:1.6;font-size:17px}.poem{font-style:italic}</style></head>' +
    '<body><h1>Uma narrativa</h1><p class="poem">Texto com <em>ênfase</em> editorial.</p>' +
    '<p>O livro permanece reflowable conforme a largura da janela.</p>' +
    '<img alt="Imagem de teste" width="48" height="48" ' +
    'src="data:image/png;base64,' + samplePng + '"/></body></html>';
  const fixed = '<html xmlns="http://www.w3.org/1999/xhtml"><head>' +
    '<title>Prancha fixa</title><meta name="viewport" content="width=800, height=600"/>' +
    '<style>body{margin:0}.stage{position:relative;width:800px;height:600px;' +
    'background:#e7e7e7;font-family:serif}' +
    '.caption{position:absolute;top:110px;left:160px;color:#242424;font-size:24px}' +
    '</style></head><body><div class="stage">' +
    '<p class="caption">Diagrama em layout fixo</p>' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="100" ' +
    'viewBox="0 0 180 100" aria-label="Ilustração">' +
    '<rect width="180" height="100" fill="#206080"/>' +
    '<circle cx="90" cy="50" r="32" fill="#ffeebb"/></svg></div></body></html>';
  zip.file('OPS/chapter.xhtml', chapter);
  zip.file('OPS/fixed.xhtml', fixed);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

async function capturePresentation(page, markup, fixed) {
  await page.setViewportSize(fixed ? { width: 850, height: 640 } :
    { width: 480, height: 710 });
  await page.setContent(markup, { waitUntil: 'load' });
  const metrics = await page.evaluate(() => {
    const heading = document.querySelector('h1');
    const paragraph = document.querySelector('p');
    const image = document.querySelector('img');
    const stage = document.querySelector('.stage');
    return {
      heading: heading?.textContent,
      paragraphs: document.querySelectorAll('p').length,
      fontFamily: paragraph ? getComputedStyle(paragraph).fontFamily : '',
      fontStyle: paragraph ? getComputedStyle(paragraph).fontStyle : '',
      imageWidth: image?.naturalWidth ?? 0,
      stageWidth: stage?.getBoundingClientRect().width ?? 0,
      stageHeight: stage?.getBoundingClientRect().height ?? 0,
    };
  });
  const hash = createHash('sha256').update(await page.screenshot({ fullPage: true }))
    .digest('hex');
  return { ...metrics, hash };
}

async function presentationAndImageSmoke(browser) {
  const context = await browser.newContext({ viewport: { width: 850, height: 640 } });
  const page = await context.newPage();
  try {
    const input = await syntheticPresentationEpub();
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' });
    const repairedBytes = await page.evaluate(async (raw) => {
      const [{ repairEpub }, { DEFAULT_REPAIR_OPTIONS }] = await Promise.all([
        import('/src/epub/repair/repairEpub.ts'),
        import('/src/epub/utils/constants.ts'),
      ]);
      const result = await repairEpub('visual.epub', Uint8Array.from(raw),
        { ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true });
      if (!result.changed || !result.blob) throw new Error('Reparo visual não gerou EPUB');
      return Array.from(new Uint8Array(await result.blob.arrayBuffer()));
    }, Array.from(input));
    const before = await JSZip.loadAsync(input);
    const after = await JSZip.loadAsync(Uint8Array.from(repairedBytes));
    for (const [file, fixed] of [['OPS/chapter.xhtml', false], ['OPS/fixed.xhtml', true]]) {
      const original = await before.file(file).async('string');
      const updated = await after.file(file).async('string');
      const baseline = await capturePresentation(page, original, fixed);
      const actual = await capturePresentation(page, updated, fixed);
      assert.deepEqual(actual, baseline, 'Mudança visual inesperada em ' + file);
      if (fixed) {
        assert.equal(actual.stageWidth, 800);
        assert.equal(actual.stageHeight, 600);
      } else {
        assert.equal(actual.imageWidth, 1);
        assert.match(actual.fontFamily, /Georgia/u);
      }
    }

    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' });
    const image = await page.evaluate(async (raw) => {
      const [{ repairImageCompatibility }, { isProgressiveJpeg }] = await Promise.all([
        import('/src/epub/repair/repairImages.ts'),
        import('/src/epub/utils/kindleCompatibility.ts'),
      ]);
      const initial = Uint8Array.from(raw);
      const files = new Map([['OPS/figure.jpg', initial]]);
      const actions = await repairImageCompatibility(files, {
        manifest: [{ id: 'figure', exists: true, mediaType: 'image/jpeg',
          resolvedPath: 'OPS/figure.jpg' }],
      }, { kindleSafeMode: true, conservativeMode: false });
      const output = files.get('OPS/figure.jpg');
      return {
        progressiveInput: isProgressiveJpeg(initial),
        progressiveOutput: isProgressiveJpeg(output),
        changed: output.length !== initial.length ||
          output.some((value, index) => value !== initial[index]),
        normalized: actions.some((action) => action.type === 'normalized'),
      };
    }, Array.from(Buffer.from(progressiveJpeg, 'base64')));
    assert.equal(image.progressiveInput, true);
    assert.equal(image.progressiveOutput, false);
    assert.equal(image.changed, true);
    assert.equal(image.normalized, true);

    
    
    const cover = await page.evaluate(async (raw) => {
      const { readCoverImageFile } = await import('/src/epub/cover/coverImageInput.ts');
      const source = Uint8Array.from(raw);
      const result = await readCoverImageFile(new File([source], 'capa.jpg',
        { type: 'image/jpeg' }));
      const output = result.bytes;
      return {
        normalized: result.normalized === true,
        changed: source.length !== output.length ||
          output.some((byte, index) => byte !== source[index]),
        validJpeg: output[0] === 0xff && output[1] === 0xd8,
      };
    }, Array.from(Buffer.from(progressiveJpeg, 'base64')));
    assert.equal(cover.validJpeg, true);
    assert.equal(cover.changed, cover.normalized);
    console.log('PASS EPUB presentation+JPEG browser=' + selected +
      ' coverNormalized=' + cover.normalized);
  } finally {
    await context.close();
  }
}

const browser = await engine.launch({ headless: true });
try {
  await scenario(browser, false);
  await scenario(browser, true);
  await presentationAndImageSmoke(browser);
} finally {
  await browser.close();
}
