// @vitest-environment jsdom
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { parsePackageDocument } from '../src/epub/validation/opfParser';
import { validateNavigation } from '../src/epub/validation/validateNavigation';
import { validateKindleCompatibility } from '../src/epub/validation/validateKindleCompatibility';
import { validateCssReferences } from '../src/epub/validation/validateCssReferences';
import { repairKindleCompatibility } from '../src/epub/repair/repairKindleCompatibility';
import { sanitizeCssDocument } from '../src/epub/sanitize/sanitizeCss';
import { sanitizeHtmlDocument } from '../src/epub/sanitize/sanitizeHtml';
import { DEFAULT_REPAIR_OPTIONS, EPUB_MIME } from '../src/epub/utils/constants';

const textDecoder = new TextDecoder();
const stylesheet = '@import url("https://fonts.googleapis.com/css2?family=Literata");\n'
  + '@font-face{font-family:"Literata";src:url("https://cdn.example.org/Literata.woff2") format("woff2")}\n'
  + '@font-face{font-family:"Local";src:url(data:font/woff2;base64,AAECAw==) format("woff2")}\n'
  + 'p { font-family: "Literata", serif; }';

async function epubFixture(options: { version?: '2.0' | '3.0'; brokenNcx?: boolean } = {}): Promise<Uint8Array> {
  const version = options.version ?? '2.0';
  const zip = new JSZip();
  zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
  zip.file('META-INF/container.xml', '<?xml version="1.0" encoding="utf-8"?>'
    + '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">'
    + '<rootfiles><rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml"/>'
    + '</rootfiles></container>');
  const navEntry = version === '3.0'
    ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
    : '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>';
  zip.file('OPS/content.opf', '<?xml version="1.0" encoding="utf-8"?>'
    + '<package xmlns="http://www.idpf.org/2007/opf" version="' + version + '" unique-identifier="id">'
    + '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
    + '<dc:identifier id="id">urn:uuid:test-epub-toc</dc:identifier>'
    + '<dc:title>Livro de teste</dc:title><dc:language>pt-BR</dc:language></metadata>'
    + '<manifest>' + navEntry
    + '<item id="one" href="Text/one.xhtml" media-type="application/xhtml+xml"/>'
    + '<item id="two" href="Text/two.xhtml" media-type="application/xhtml+xml"/>'
    + '<item id="css" href="Styles/book.css" media-type="text/css"/>'
    + '</manifest><spine' + (version === '2.0' ? ' toc="ncx"' : '')
    + '><itemref idref="one"/><itemref idref="two" linear="no"/></spine></package>');
  const chapter = (title: string) => '<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR" xml:lang="pt-BR">'
    + '<head><title>' + title + '</title>'
    + '<link rel="stylesheet" href="../Styles/book.css"/>'
    + '<link rel="stylesheet" href="https://fonts.example.org/style.css"/>'
    + '</head><body><h1 id="start">' + title + '</h1>'
    + '<a href="https://example.org/referencia">Referência legítima</a></body></html>';
  zip.file('OPS/Text/one.xhtml', chapter('Capítulo principal'));
  zip.file('OPS/Text/two.xhtml', chapter('Apêndice não listado no NCX'));
  zip.file('OPS/Styles/book.css', stylesheet);
  if (version === '2.0') {
    zip.file('OPS/toc.ncx', '<?xml version="1.0" encoding="UTF-8"?>'
      + '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">'
      + '<docTitle><text>Livro de teste</text></docTitle><navMap>'
      + '<navPoint id="chapter" playOrder="1"><navLabel><text>Início</text></navLabel>'
      + '<content src="' + (options.brokenNcx ? 'Text/absent.xhtml' : 'Text/one.xhtml#start')
      + '"/></navPoint></navMap></ncx>');
  } else {
    // O prefixo de namespace pode ser qualquer um, não precisa ser "epub".
    zip.file('OPS/nav.xhtml',
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ops="http://www.idpf.org/2007/ops">'
      + '<head><title>Índice</title></head><body><nav ops:type="toc"><ol>'
      + '<li><a href="Text/one.xhtml#start">Início</a></li></ol></nav></body></html>');
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

describe('referências externas legítimas', () => {
  it('preserva fontes HTTPS, @import e data:font ao corrigir CSS', () => {
    const repaired = sanitizeCssDocument('OPS/Styles/book.css', stylesheet, new Set(['OPS/Styles/book.css']));
    expect(repaired.changed).toBe(false);
    expect(repaired.text).toBe(stylesheet);
    expect(DEFAULT_REPAIR_OPTIONS.removeRemoteResourceLinks).toBe(false);
  });

  it('não trata fontes externas nem links HTTPS como alertas ou riscos de segurança', async () => {
    const bytes = await epubFixture();
    const report = await inspectEpub('livro.epub', bytes);
    expect(report.issues.some((issue) =>
      issue.code === 'CSS_REMOTE_RESOURCE'
      || issue.code === 'CONTENT_REMOTE_RESOURCE'
      || issue.code === 'CSS_UNSAFE_RESOURCE'
      || issue.code === 'CONTENT_UNSAFE_URL',
    )).toBe(false);
    expect(report.stats.securityScore).toBe(100);
  });

  it('preserva <style> com @font-face e <a> HTTPS quando remove scripts perigosos', () => {
    const original = '<html xmlns="http://www.w3.org/1999/xhtml"><head><style>'
      + '@import "https://fonts.example.org/typography.css";'
      + '@font-face { font-family: Book; src: url(https://fonts.example.org/font.woff2) }'
      + '</style></head><body>'
      + '<a href="https://example.org">Link</a><img src="https://example.org/a.jpg"/>'
      + '<script>alert(1)</script></body></html>';
    const result = sanitizeHtmlDocument(original, {
      filePath: 'OPS/Text/one.xhtml',
      existingFiles: new Set(['OPS/Text/one.xhtml']),
      kindleSafeMode: true,
      sanitizeScripts: true,
      removeRemoteResourceLinks: false,
    });
    expect(result.text).toContain('@font-face');
    expect(result.text).toContain('https://fonts.example.org/font.woff2');
    expect(result.text).toContain('href="https://example.org"');
    expect(result.text).toContain('src="https://example.org/a.jpg"');
    expect(result.text).not.toContain('<script');
  });

  it('mantém a remoção voluntária de recursos externos sem aceitar javascript:', () => {
    const input = '@import url("https://fonts.example.org/styling.css");'
      + '.bad{background:url(j\\61vascript:alert(1))}';
    const defaultResult = sanitizeCssDocument('OPS/Styles/book.css', input, new Set(['OPS/Styles/book.css']));
    expect(defaultResult.text).toContain('https://fonts.example.org/styling.css');
    expect(defaultResult.text).not.toContain('j\\61vascript');
    const strict = sanitizeCssDocument('OPS/Styles/book.css', input, new Set(['OPS/Styles/book.css']), true);
    expect(strict.text).not.toContain('https://fonts.example.org');
    expect(strict.text).not.toContain('j\\61vascript');
  });

  it('continua apontando recursos locais realmente ausentes', async () => {
    const loaded = await loadEpub('livro.epub', await epubFixture());
    const parsed = parsePackageDocument(loaded);
    if (!parsed.packageInfo) throw new Error('OPF ausente');
    const brokenCss = new TextEncoder().encode('@font-face{src:url("../Fonts/missing.woff2")}');
    loaded.files.set('OPS/Styles/book.css', { path: 'OPS/Styles/book.css', bytes: brokenCss, directory: false });
    expect(validateCssReferences(loaded, parsed.packageInfo).some((issue) => issue.code === 'CSS_MISSING_RESOURCE')).toBe(true);
  });
});

describe('índice parcial não é necessariamente inválido', () => {
  it('não acusa "NCX não cobre spine" para sumário editorial parcial com fragmento', async () => {
    const bytes = await epubFixture();
    const loaded = await loadEpub('livro.epub', bytes);
    const parsed = parsePackageDocument(loaded);
    if (!parsed.packageInfo) throw new Error('OPF ausente');
    const codes = validateKindleCompatibility(loaded, parsed.packageInfo).map((issue) => issue.code);
    expect(codes).not.toContain('NCX_SPINE_MISSING_ITEMS');
    expect(codes).not.toContain('NCX_CONTENT_MISSING_RESOURCE');
    const report = await inspectEpub('livro.epub', bytes);
    expect(report.issues.map((issue) => issue.code)).not.toContain('NCX_SPINE_MISSING_ITEMS');
  });

  it('não injeta apêndices e documentos do spine em um NCX válido', async () => {
    const loaded = await loadEpub('livro.epub', await epubFixture());
    const parsed = parsePackageDocument(loaded);
    if (!parsed.packageInfo) throw new Error('OPF ausente');
    const files = new Map([...loaded.files].map(([name, entry]) => [name, entry.bytes]));
    const before = textDecoder.decode(files.get('OPS/toc.ncx'));
    const actions = repairKindleCompatibility(files, parsed.packageInfo, { conservativeMode: true });
    expect(textDecoder.decode(files.get('OPS/toc.ncx'))).toBe(before);
    expect(actions).toEqual([]);
    expect(before.match(/<navPoint/g)).toHaveLength(1);
  });

  it('não sinaliza ausência do NCX opcional em EPUB 3 nem exige prefixo literal epub:', async () => {
    const loaded = await loadEpub('epub3.epub', await epubFixture({ version: '3.0' }));
    const parsed = parsePackageDocument(loaded);
    if (!parsed.packageInfo) throw new Error('OPF ausente');
    const codes = validateNavigation(loaded, parsed.packageInfo).map((issue) => issue.code);
    expect(codes).not.toContain('NCX_MISSING');
    expect(codes).not.toContain('NAV_INVALID');
  });

  it('continua detectando alvos do NCX que realmente não existem', async () => {
    const loaded = await loadEpub('quebrado.epub', await epubFixture({ brokenNcx: true }));
    const parsed = parsePackageDocument(loaded);
    if (!parsed.packageInfo) throw new Error('OPF ausente');
    expect(validateKindleCompatibility(loaded, parsed.packageInfo).some((issue) =>
      issue.code === 'NCX_CONTENT_MISSING_RESOURCE',
    )).toBe(true);
  });
});
