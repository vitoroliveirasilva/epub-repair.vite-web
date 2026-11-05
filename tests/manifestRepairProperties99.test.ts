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
      reader.onerror = () => reject(reader.error ?? new Error('Blob ilegível'));
      reader.readAsArrayBuffer(this);
    });
  };
});

async function fixture() {
  const zip = new JSZip();
  zip.file('META-INF/container.xml',
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/>' +
    '</rootfiles></container>');
  zip.file('OPS/book.opf',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:props-synthetic</dc:identifier>' +
    '<dc:title>Livro sintético</dc:title><dc:language>pt-BR</dc:language>' +
    '<meta property="dcterms:modified">2026-11-05T12:00:00Z</meta></metadata>' +
    '<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
    '<item id="c" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
    '</manifest><spine><itemref idref="c"/></spine></package>');
  zip.file('OPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
    '<head><title>Nav</title></head><body><nav epub:type="toc"><ol>' +
    '<li><a href="chapter.xhtml#start">Capítulo</a></li></ol></nav></body></html>');
  zip.file('OPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Capítulo</title></head>' +
    '<body><h1 id="start">Introdução</h1><a href="https://example.org">Referências</a>' +
    '<form action="#"><label>Pesquisa<input/></label></form></body></html>');
  // CSS HTTP legítimo começa órfão. O reparo precisa declará-lo sem violar
  // invariantes do manifest e sem apagar a fonte remota.
  zip.file('OPS/styles.css',
    '@font-face{font-family:Test;src:url("https://example.org/font.woff2");}');
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

describe('E-042: sincronização conservadora de properties depois do reparo', () => {
  it('inclui propriedades obrigatórias em arquivos novos e existentes', async () => {
    const original = await fixture();
    const repaired = await repairEpub('livro.epub', original, {
      ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true, sanitizeScripts: false,
    });
    expect(repaired.changed).toBe(true);
    expect(repaired.blob).toBeDefined();
    const zip = await JSZip.loadAsync(await repaired.blob!.arrayBuffer());
    const opf = await zip.file('OPS/book.opf')!.async('string');
    const css = await zip.file('OPS/styles.css')!.async('string');
    const dom = new DOMParser().parseFromString(opf, 'application/xml');
    const items = Array.from(dom.getElementsByTagName('*'))
      .filter((node) => node.localName === 'item');
    const styleItem = items.find((node) => node.getAttribute('href') === 'styles.css');
    const chapterItem = items.find((node) => node.getAttribute('id') === 'c');
    expect(styleItem?.getAttribute('properties')).toContain('remote-resources');
    expect(chapterItem?.getAttribute('properties')).toContain('scripted');
    expect(chapterItem?.getAttribute('properties')).not.toContain('remote-resources');
    expect(css).toContain('https://example.org/font.woff2');
    expect(repaired.after.issues.some((i) => i.code === 'OPF_MANIFEST_PROPERTY_MISSING'))
      .toBe(false);
  });
  it('quando opt-out do manifest está ativo, não altera o OPF para inventar propriedades', async () => {
    const original = await fixture();
    const repaired = await repairEpub('livro.epub', original, {
      ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true, repairManifest: false,
    });
    expect(repaired.changed).toBe(true);
    const zip = await JSZip.loadAsync(await repaired.blob!.arrayBuffer());
    const opf = await zip.file('OPS/book.opf')!.async('string');
    const dom = new DOMParser().parseFromString(opf, 'application/xml');
    const chapter = Array.from(dom.getElementsByTagName('*')).find((node) =>
      node.localName === 'item' && node.getAttribute('id') === 'c');
    expect(chapter?.hasAttribute('properties')).toBe(false);
  });
});
