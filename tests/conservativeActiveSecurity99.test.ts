// @vitest-environment jsdom
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { repairEpub } from '../src/epub/repair/repairEpub';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';
import { hasManualReviewIssues, hasResidualActiveContent } from '../src/epub/utils/reportGuards';

beforeAll(() => {
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

async function fixture(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('META-INF/container.xml',
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/>' +
    '</rootfiles></container>');
  zip.file('OPS/book.opf',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:security-fixture</dc:identifier><dc:title>Teste</dc:title>' +
    '<dc:language>pt-BR</dc:language><meta property="dcterms:modified">2026-11-05T12:00:00Z</meta>' +
    '</metadata><manifest>' +
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
    '<item id="ch" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="css" href="style.css" media-type="text/css"/>' +
    '<item id="svg" href="image.svg" media-type="image/svg+xml"/>' +
    '</manifest><spine><itemref idref="ch"/></spine></package>');
  zip.file('OPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
    '<head><title>Índice</title></head><body><nav epub:type="toc"><ol>' +
    '<li><a href="chapter.xhtml#start">Capítulo</a></li></ol></nav></body></html>');
  zip.file('OPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Livro</title>' +
    '<style>p {color: blue; width: expression(alert(1)); font-size: 1em;}</style>' +
    '<link rel="stylesheet" href="style.css"/></head><body>' +
    '<h1 id="start">Capítulo</h1><p>O texto original permanece aqui.</p>' +
    '<a href="https://example.org/fonte">Fonte externa legítima</a>' +
    '<a href="java&#x73;cript:alert(2)" onclick="alert(3)">Link editável</a>' +
    '<script>alert(4)</script></body></html>');
  zip.file('OPS/style.css',
    'p {color: blue; background:url("javascript:alert(2)");}' +
    ' @font-face{font-family:Teste;src:url("https://example.org/fonte.woff2");}');
  zip.file('OPS/image.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">' +
    '<text>Ilustração</text></svg>');
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

describe('E-052: saneamento e diagnóstico em modo conservador', () => {
  it('remove conteúdo ativo de XHTML, CSS e SVG sem eliminar texto nem URLs HTTPS', async () => {
    const original = await fixture();
    const before = await inspectEpub('livro.epub', original);
    expect(hasResidualActiveContent(before)).toBe(true);
    const result = await repairEpub('livro.epub', original, {
      ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true, sanitizeScripts: true,
    });
    expect(result.changed).toBe(true);
    expect(result.blob).toBeDefined();
    const zip = await JSZip.loadAsync(await result.blob!.arrayBuffer());
    const chapter = await zip.file('OPS/chapter.xhtml')!.async('string');
    const style = await zip.file('OPS/style.css')!.async('string');
    const svg = await zip.file('OPS/image.svg')!.async('string');
    expect(chapter).toContain('O texto original permanece aqui.');
    expect(chapter).toContain('https://example.org/fonte');
    expect(chapter).not.toContain('alert(4)');
    expect(chapter).not.toContain('java&#x73;cript');
    expect(chapter).toContain('color: blue');
    expect(style).toContain('https://example.org/fonte.woff2');
    expect(style).not.toContain('javascript:');
    expect(svg).not.toContain('onload');
    expect(result.after.stats.fatalCount).toBe(0);
    expect(hasResidualActiveContent(result.after)).toBe(false);
  });

  it('quando opt-out de scripts está ativo, a cópia não afirma estar limpa', async () => {
    const original = await fixture();
    const result = await repairEpub('livro.epub', original, {
      ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true, sanitizeScripts: false,
    });
    expect(result.changed).toBe(true); // Corrige mimetype sem reescrever conteúdo ativo
    expect(result.blob).toBeDefined();
    const zip = await JSZip.loadAsync(await result.blob!.arrayBuffer());
    const chapter = await zip.file('OPS/chapter.xhtml')!.async('string');
    expect(chapter).toContain('<script>alert(4)</script>');
    expect(hasManualReviewIssues(result.after)).toBe(true);
    expect(result.warnings.some((message) => message.includes('revisão manual'))).toBe(true);
  });
});
