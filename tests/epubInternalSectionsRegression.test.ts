import { beforeAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { repairEpub } from '../src/epub/repair/repairEpub';
import { DEFAULT_REPAIR_OPTIONS, EPUB_MIME } from '../src/epub/utils/constants';
import type { ManifestItem, PackageDocumentInfo } from '../src/epub/model/opfTypes';
import { inspectInternalNcx, recoverInternalNcx } from '../src/epub/utils/epubSectionRecovery';
import { parseXml } from '../src/epub/utils/xmlUtils';

const enc = (value: string): Uint8Array => new TextEncoder().encode(value);
const passage = 'Conteúdo narrativo de um livro sintético para testes de navegação. '.repeat(3);

function chapterFile(count: number, introductory: boolean): string {
  const sections: string[] = [];
  if (introductory) {
    sections.push('<p>Entrevista inicial</p><p>' + passage + '</p>');
  }
  for (let i = 0; i < count; i += 1) {
    sections.push('<p></p><p class="sgc1">Epígrafe de abertura para seção de teste.</p>' +
      '<p class="p2">— Fonte de teste</p><p></p><p class="calibre2">' +
      passage + '</p>' +
      Array.from({length: 18}, () => '<p class="calibre2">' + passage + '</p>').join(''));
  }
  return '<?xml version="1.0" encoding="utf-8"?>' +
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Livro</title></head>' +
    '<body>' + sections.join('') + '</body></html>';
}

function fixture(withGenerated = false): {
  pkg: PackageDocumentInfo;
  files: Map<string, Uint8Array>;
} {
  const ncxPoints = [
    '<navPoint id="original-cover" playOrder="1"><navLabel><text>Capa</text></navLabel>' +
      '<content src="Text/cover.xhtml"/></navPoint>',
    ...(withGenerated
      ? ['<navPoint id="epub-repair-text-1" playOrder="2">' +
        '<navLabel><text>Texto principal (parte 1)</text></navLabel>' +
        '<content src="Text/a.xhtml"/></navPoint>']
      : []),
    '<navPoint id="original-end" playOrder="3"><navLabel><text>Epílogo</text></navLabel>' +
      '<content src="Text/end.xhtml"/></navPoint>',
  ];
  const toc = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">' +
    '<navMap>' + ncxPoints.join('') + '</navMap></ncx>';
  const files = new Map([
    ['OPS/toc.ncx', enc(toc)],
    ['OPS/Text/cover.xhtml', enc('<html><body>Capa</body></html>')],
    ['OPS/Text/a.xhtml', enc(chapterFile(3, true))],
    ['OPS/Text/b.xhtml', enc(chapterFile(2, false))],
    ['OPS/Text/end.xhtml', enc('<html><body>Epílogo</body></html>')],
  ]);
  const paths = ['cover.xhtml', 'a.xhtml', 'b.xhtml', 'end.xhtml'];
  const manifest: ManifestItem[] = paths.map((name) => ({
    id: name, href: 'Text/' + name, mediaType: 'application/xhtml+xml',
    properties: [], resolvedPath: 'OPS/Text/' + name, pathSafe: true, exists: true,
  }));
  const ncxItem: ManifestItem = {
    id: 'ncx', href: 'toc.ncx', mediaType: 'application/x-dtbncx+xml',
    properties: [], resolvedPath: 'OPS/toc.ncx', pathSafe: true, exists: true,
  };
  return {
    files,
    pkg: {
      opfPath: 'OPS/content.opf', opfDir: 'OPS', version: '2.0',
      metadata: { title: 'Livro sintético' },
      manifest: [...manifest, ncxItem],
      spine: manifest.map((item) => ({ idref: item.id, manifestItem: item })),
      ncxItem, rootfileCount: 1,
    },
  };
}

beforeAll(() => {
  if (typeof Blob.prototype.arrayBuffer === 'function') return;
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error('EPUB ilegível'));
      reader.readAsArrayBuffer(this);
    });
  };
});

async function syntheticEpub(): Promise<Uint8Array> {
  const { files } = fixture(true);
  const zip = new JSZip();
  zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
  zip.file('META-INF/container.xml',
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" ' +
    'media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OPS/book.opf',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<package xmlns="http://www.idpf.org/2007/opf" version="2.0" ' +
    'unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:title>Livro sintético</dc:title>' +
    '<dc:identifier id="uid">urn:uuid:11111111-2222-3333-4444-555555555555</dc:identifier>' +
    '<dc:language>pt-BR</dc:language></metadata><manifest>' +
    '<item id="cover" href="Text/cover.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="a" href="Text/a.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="b" href="Text/b.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="end" href="Text/end.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' +
    '</manifest><spine toc="ncx"><itemref idref="cover"/><itemref idref="a"/>' +
    '<itemref idref="b"/><itemref idref="end"/></spine></package>');
  for (const [path, contents] of files) zip.file(path, contents);
  return new Uint8Array(await zip.generateAsync({
    type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 },
  }));
}

describe('EPUB 2 com capítulos múltiplos em um único XHTML', () => {
  it('detecta cinco divisões internas, mesmo com NCX estruturalmente válido', () => {
    const { pkg, files } = fixture();
    const report = inspectInternalNcx(pkg, (path) => files.get(path));
    expect(report.sections).toHaveLength(5);
    expect(report.missing).toHaveLength(5);
    expect(report.safeToRepair).toBe(true);
  });

  it('cria destinos no próprio parágrafo e mantém textos e entradas editoriais', () => {
    const { pkg, files } = fixture();
    const before = ['OPS/Text/a.xhtml', 'OPS/Text/b.xhtml']
      .map((path) => parseXml(new TextDecoder().decode(files.get(path))).documentElement.textContent);
    const actions = recoverInternalNcx(files, pkg);
    expect(actions).toHaveLength(1);
    const toc = parseXml(new TextDecoder().decode(files.get('OPS/toc.ncx')));
    const navs = Array.from(toc.getElementsByTagName('*'))
      .filter((element) => element.localName === 'navPoint');
    expect(navs).toHaveLength(8);
    expect(navs[0]!.getAttribute('id')).toBe('original-cover');
    expect(navs[navs.length - 1]!.getAttribute('id')).toBe('original-end');
    const hrefs = navs.map((point) => Array.from(point.children)
      .find((element) => element.localName === 'content')?.getAttribute('src') ?? '');
    expect(hrefs.filter((href) => href.includes('#epub-repair-chapter-'))).toHaveLength(5);
    expect(hrefs).toContain('Text/a.xhtml');
    const after = ['OPS/Text/a.xhtml', 'OPS/Text/b.xhtml']
      .map((path) => parseXml(new TextDecoder().decode(files.get(path))).documentElement.textContent);
    expect(after).toEqual(before);
    const report = inspectInternalNcx(pkg, (path) => files.get(path));
    expect(report.missing).toHaveLength(0);
    expect(recoverInternalNcx(files, pkg)).toEqual([]);
  });

  it('conserva placeholders produzidos pelo reparo anterior enquanto adiciona capítulos', () => {
    const { pkg, files } = fixture(true);
    const original = new TextDecoder().decode(files.get('OPS/toc.ncx'));
    expect(original).toContain('Texto principal (parte 1)');
    expect(recoverInternalNcx(files, pkg)).toHaveLength(1);
    const updated = new TextDecoder().decode(files.get('OPS/toc.ncx'));
    expect(updated).toContain('Texto principal (parte 1)');
    expect(updated).toContain('original-cover');
    expect(updated).toContain('original-end');
    expect(updated).toContain('epub-repair-chapter-005');
    const originalXml = parseXml(original);
    const updatedXml = parseXml(updated);
    const fingerprint = (doc: Document) => Array.from(doc.getElementsByTagName('*'))
      .filter((node) => node.localName === 'navPoint')
      .map((node) => [
        node.getAttribute('id'),
        Array.from(node.children).find((child) => child.localName === 'navLabel')
          ?.textContent,
        Array.from(node.children).find((child) => child.localName === 'content')
          ?.getAttribute('src'),
      ]);
    const originalEntries = fingerprint(originalXml);
    const finalEntries = fingerprint(updatedXml);
    expect(finalEntries.filter((entry) =>
      originalEntries.some((old) => JSON.stringify(old) === JSON.stringify(entry))))
      .toEqual(originalEntries);
    expect(finalEntries).toHaveLength(8);
    expect(recoverInternalNcx(files, pkg)).toEqual([]);
    expect(new TextDecoder().decode(files.get('OPS/toc.ncx'))).toBe(updated);
  });

  it('não reescreve NCX hierárquico de autoria desconhecida', () => {
    const { pkg, files } = fixture();
    const current = new TextDecoder().decode(files.get('OPS/toc.ncx'));
    const nested = current.replace('</navPoint><navPoint id="original-end"',
      '<navPoint id="nested" playOrder="2"><navLabel><text>Subdivisão</text></navLabel>' +
      '<content src="Text/a.xhtml"/></navPoint></navPoint><navPoint id="original-end"');
    files.set('OPS/toc.ncx', enc(nested));
    expect(inspectInternalNcx(pkg, (path) => files.get(path)).safeToRepair).toBe(false);
    expect(recoverInternalNcx(files, pkg)).toEqual([]);
    expect(new TextDecoder().decode(files.get('OPS/toc.ncx'))).toBe(nested);
  });
  it('passa pelo reparo completo, preservação e nova inspeção do EPUB ZIP', async () => {
    const input = await syntheticEpub();
    const before = await inspectEpub('fixture.epub', input);
    expect(before.issues.map((item) => item.code)).toContain('NCX_INTERNAL_SECTIONS_MISSING');
    const result = await repairEpub('fixture.epub', input, DEFAULT_REPAIR_OPTIONS);
    expect(result.changed).toBe(true);
    expect(result.actions.some((item) =>
      item.title === 'Capítulos internos adicionados ao NCX')).toBe(true);
    expect(result.blob).toBeDefined();
    const repaired = new Uint8Array(await result.blob!.arrayBuffer());
    const after = await inspectEpub(result.fileName, repaired);
    expect(after.validZip).toBe(true);
    expect(after.issues.map((item) => item.code)).not.toContain('NCX_INTERNAL_SECTIONS_MISSING');
    expect(after.issues.map((item) => item.code)).toContain('NCX_EDITORIAL_INFERENCE');
    expect(after.stats.structureScore).toBe(100);
    expect(after.stats.kindleScore).toBe(100);
    const zip = await JSZip.loadAsync(repaired);
    const toc = parseXml(await zip.file('OPS/toc.ncx')!.async('string'));
    const points = Array.from(toc.getElementsByTagName('*'))
      .filter((item) => item.localName === 'navPoint');
    expect(points).toHaveLength(8);
    expect(points.some((item) => item.getAttribute('id') === 'original-cover')).toBe(true);
    expect(points.some((item) => item.getAttribute('id') === 'original-end')).toBe(true);
    expect(points.some((item) => item.getAttribute('id') === 'epub-repair-text-1')).toBe(true);
    const second = await repairEpub('repaired.epub', repaired, DEFAULT_REPAIR_OPTIONS);
    expect(second.actions.some((action) =>
      action.title === 'Capítulos internos adicionados ao NCX')).toBe(false);
    expect(second.changed).toBe(false);
  }, 30000);

});
