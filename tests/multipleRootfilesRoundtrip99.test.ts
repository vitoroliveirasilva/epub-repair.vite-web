
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { parsePackageDocument } from '../src/epub/validation/opfParser';
import { repairEpub } from '../src/epub/repair/repairEpub';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';
import { hasManualReviewIssues } from '../src/epub/utils/reportGuards';

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
const packageXml = (title: string) =>
  '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
  '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
  '<dc:identifier id="uid">urn:uuid:' + title + '</dc:identifier>' +
  '<dc:title>' + title + '</dc:title><dc:language>pt-BR</dc:language>' +
  '<meta property="dcterms:modified">2026-11-05T12:00:00Z</meta>' +
  '</metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" ' +
  'properties="nav"/><item id="chapter" href="chapter.xhtml" ' +
  'media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/>' +
  '</spine></package>';
const nav = '<html xmlns="http://www.w3.org/1999/xhtml" ' +
  'xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Nav</title></head><body>' +
  '<nav epub:type="toc"><ol><li><a href="chapter.xhtml#inicio">Capítulo</a>' +
  '</li></ol></nav></body></html>';
const chapter = '<html xmlns="http://www.w3.org/1999/xhtml"><head>' +
  '<title>Capítulo</title></head><body><h1 id="inicio">Texto</h1></body></html>';

async function fixture(rootfiles: Array<{path:string;mime?:string}>) {
  const zip = new JSZip();
  zip.file('META-INF/container.xml',
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
    '<rootfiles>' + rootfiles.map(({path,mime}) =>
      '<rootfile full-path="' + path + '" media-type="' +
      (mime ?? 'application/oebps-package+xml') + '"/>').join('') +
    '</rootfiles></container>');
  for (const dir of ['OPS','EPUB','LEGACY']) {
    zip.file(dir + '/content.opf', packageXml(dir));
    zip.file(dir + '/nav.xhtml', nav);
    zip.file(dir + '/chapter.xhtml', chapter);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

describe('E-029: múltiplas renditions/rootfiles sem perda de dados', () => {
  it('prioriza primeiro OPF com MIME correto e arquivo existente', async () => {
    const raw = await fixture([
      { path: 'LEGACY/content.opf', mime: 'text/xml' },
      { path: 'EPUB/content.opf' },
      { path: 'OPS/content.opf' },
    ]);
    const loaded = await loadEpub('multirendition.epub', raw);
    const parsed = parsePackageDocument(loaded);
    expect(parsed.packageInfo?.opfPath).toBe('EPUB/content.opf');
    expect(parsed.packageInfo?.rootfileCount).toBe(3);
    expect(parsed.issues.map((i) => i.code)).toContain('CONTAINER_MULTIPLE_ROOTFILES');
    expect(parsed.issues.some((i) => i.code === 'CONTAINER_ROOTFILE_MEDIA_TYPE_INVALID'))
      .toBe(false);
  });
  it('não seleciona OPF ausente no primeiro rootfile quando há alternativa válida', async () => {
    const raw = await fixture([
      { path: 'OPS/missing.opf' },
      { path: 'OPS/content.opf' },
      { path: 'EPUB/content.opf' },
    ]);
    expect(parsePackageDocument(await loadEpub('multi.epub', raw)).packageInfo?.opfPath)
      .toBe('OPS/content.opf');
  });
  it('preserva integralmente os OPFs e XHTML de renditions não selecionadas', async () => {
    const raw = await fixture([{ path: 'EPUB/content.opf' }, { path: 'OPS/content.opf' }]);
    const original = await loadEpub('multirendition.epub', raw);
    const repaired = await repairEpub('multirendition.epub', raw, {
      ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true,
    });
    expect(repaired.changed).toBe(true); 
    expect(repaired.blob).toBeDefined();
    const output = await JSZip.loadAsync(await repaired.blob!.arrayBuffer());
    
    expect(await output.file('META-INF/container.xml')!.async('uint8array'))
      .toEqual(original.files.get('META-INF/container.xml')!.bytes);
    for (const name of ['OPS/content.opf','OPS/nav.xhtml','OPS/chapter.xhtml',
      'LEGACY/content.opf','LEGACY/nav.xhtml','LEGACY/chapter.xhtml']) {
      expect(await output.file(name)!.async('uint8array'))
        .toEqual(original.files.get(name)!.bytes);
    }
    const selectedOpf = await output.file('EPUB/content.opf')!.async('string');
    expect(selectedOpf).not.toContain('../OPS/');
    expect(selectedOpf).not.toContain('../LEGACY/');
    expect(hasManualReviewIssues(repaired.after)).toBe(true);
    expect(repaired.after.packageInfo?.opfPath).toBe('EPUB/content.opf');
    expect(repaired.after.issues.some((i) => i.code === 'CONTAINER_MULTIPLE_ROOTFILES'))
      .toBe(true);
  });
  it('não inventa OPF quando todos os rootfiles são inválidos', async () => {
    const raw = await fixture([{ path: 'OPS/missing.opf' }]);
    const parsed = parsePackageDocument(await loadEpub('invalido.epub', raw));
    expect(parsed.issues.map((i) => i.code)).toContain('OPF_MISSING');
    expect(parsed.packageInfo).toBeUndefined();
  });
});
