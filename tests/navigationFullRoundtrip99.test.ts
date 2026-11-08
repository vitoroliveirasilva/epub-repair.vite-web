// @vitest-environment jsdom
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { repairEpub } from '../src/epub/repair/repairEpub';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';

beforeAll(() => {
  if (typeof Blob.prototype.arrayBuffer === 'function') return;
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error('Blob inválido'));
      reader.readAsArrayBuffer(this);
    });
  };
});

const toc = '<nav epub:type="toc"><ol><li><a href="chapter.xhtml#start">Capítulo</a></li></ol></nav>';
const pages = '<nav epub:type="page-list"><ol><li><a href="chapter.xhtml#start">1</a></li></ol></nav>';
const landmarks = '<nav epub:type="landmarks"><ol><li>' +
  '<a epub:type="bodymatter" href="chapter.xhtml">Início</a></li></ol></nav>';
const nav = '<html xmlns="http://www.w3.org/1999/xhtml" ' +
  'xmlns:epub="http://www.idpf.org/2007/ops" lang="pt-BR">' +
  '<head><title>Sumário</title></head><body>' + toc + pages + landmarks + '</body></html>';
const opf = '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
  '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
  '<dc:identifier id="uid">urn:uuid:test-navegacao</dc:identifier>' +
  '<dc:title>Navegação editorial</dc:title><dc:language>pt-BR</dc:language>' +
  '<meta property="dcterms:modified">2026-11-05T12:00:00Z</meta>' +
  '</metadata><manifest>' +
  '<item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>' +
  '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
  '<item id="coverpage" href="cover.xhtml" media-type="application/xhtml+xml"/>' +
  '</manifest><spine><itemref idref="chapter"/></spine>' +
  '<guide><reference type="cover" href="cover.xhtml"/></guide></package>';

async function input() {
  const zip = new JSZip();
  zip.file('META-INF/container.xml',
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" ' +
    'media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OPS/book.opf', opf);
  zip.file('OPS/nav.xhtml', nav);
  zip.file('OPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR"><head><title>Capítulo</title></head>' +
    '<body><h1 id="start">Título</h1><p>Conteúdo</p></body></html>');
  zip.file('OPS/cover.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR"><head><title>Capa</title></head>' +
    '<body><p>Capa</p></body></html>');
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

describe('E-040: page-list, landmarks e guide não são perdidos pelo reparador', () => {
  it('preserva bytes de NAV e guia editorial ao corrigir mimetype ausente', async () => {
    const source = await input();
    const first = await repairEpub('book.epub', source, {
      ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true,
    });
    expect(first.changed).toBe(true);
    expect(first.blob).toBeDefined();
    const produced = await JSZip.loadAsync(await first.blob!.arrayBuffer());
    expect(await produced.file('OPS/nav.xhtml')!.async('string')).toBe(nav);
    const finalOpf = await produced.file('OPS/book.opf')!.async('string');
    expect(finalOpf).toContain('type="cover"');
    expect(finalOpf).toContain('href="cover.xhtml"');
    expect(first.after.stats.fatalCount).toBe(0);
  });
  it('preserva estrutura de toc/page-list/landmarks ao reparar com modo Kindle', async () => {
    const source = await input();
    const result = await repairEpub('book.epub', source, DEFAULT_REPAIR_OPTIONS);
    expect(result.blob).toBeDefined();
    const zip = await JSZip.loadAsync(await result.blob!.arrayBuffer());
    const content = await zip.file('OPS/nav.xhtml')!.async('string');
    expect(content).toContain('page-list');
    expect(content).toContain('landmarks');
    expect(content).toContain('bodymatter');
    expect(content).toContain('toc');
    expect(result.after.issues.some((i) => i.code === 'NAV_INVALID')).toBe(false);
  });
});
