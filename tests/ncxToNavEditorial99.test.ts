
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildNavDocument } from '../src/epub/repair/repairNavigation';
import { repairEpub } from '../src/epub/repair/repairEpub';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';
import type { ManifestItem, PackageDocumentInfo } from '../src/epub/model/opfTypes';

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

const enc = (s: string) => new TextEncoder().encode(s);
const chapter: ManifestItem = {
  id:'ch', href:'Text/chapter.xhtml', mediaType:'application/xhtml+xml',
  properties:[],resolvedPath:'OPS/Text/chapter.xhtml',pathSafe:true,exists:true,
};
const ncx: ManifestItem = {
  id:'ncx',href:'toc.ncx',mediaType:'application/x-dtbncx+xml',
  properties:[],resolvedPath:'OPS/toc.ncx',pathSafe:true,exists:true,
};
const chapterXhtml = '<html xmlns="http://www.w3.org/1999/xhtml"><head>' +
  '<title>Texto original</title></head><body>' +
  '<h1 id="parte">Parte Alfa &amp; Beta</h1>' +
  '<h2 id="cap">Capítulo único</h2><h3 id="sec">Seção Ê</h3>' +
  '<p>Palavras que não podem desaparecer.</p></body></html>';
function ncxText(target = 'Text/chapter.xhtml#cap') {
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">' +
    '<head><meta name="dtb:uid" content="urn:uuid:nav-99"/></head>' +
    '<docTitle><text>Sumário autoral</text></docTitle><navMap>' +
    '<navPoint id="part" playOrder="1"><navLabel><text>Parte Alfa &amp; Beta</text></navLabel>' +
    '<content src="Text/chapter.xhtml#parte"/>' +
    '<navPoint id="chapter" playOrder="2"><navLabel><text>Capítulo único</text></navLabel>' +
    '<content src="' + target + '"/>' +
    '<navPoint id="section" playOrder="3"><navLabel><text>Seção Ê</text></navLabel>' +
    '<content src="Text/chapter.xhtml#sec"/></navPoint></navPoint></navPoint>' +
    '</navMap></ncx>';
}
function metadata(): PackageDocumentInfo {
  return {
    opfPath:'OPS/book.opf',opfDir:'OPS',version:'3.0',
    metadata:{title:'Editor',identifier:'urn:uuid:nav-99',language:'pt-BR'},
    manifest:[ncx,chapter],ncxItem:ncx,spine:[{idref:'ch',manifestItem:chapter}],
    rootfileCount:1,
  };
}
function resources(contents = ncxText()) {
  return new Map([
    ['OPS/toc.ncx',{bytes:enc(contents)}],
    ['OPS/Text/chapter.xhtml',{bytes:enc(chapterXhtml)}],
  ]);
}
function analyze(nav:string) {
  const doc = new DOMParser().parseFromString(nav, 'application/xhtml+xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  const anchors = Array.from(doc.getElementsByTagName('a'));
  return { doc, anchors };
}
describe('E-068: NAV gerado respeita hierarquia e rótulos do NCX original', () => {
  it('recupera três níveis, rótulos autorais, fragmentos e escaping sem achatar', () => {
    const nav=buildNavDocument(metadata(),'OPS/nav.xhtml',resources());
    const { doc, anchors }=analyze(nav);
    expect(anchors).toHaveLength(3);
    expect(anchors.map((a) => a.textContent))
      .toEqual(['Parte Alfa & Beta','Capítulo único','Seção Ê']);
    expect(anchors.map((a) => a.getAttribute('href')))
      .toEqual(['Text/chapter.xhtml#parte','Text/chapter.xhtml#cap',
        'Text/chapter.xhtml#sec']);
    expect(doc.getElementsByTagName('ol')).toHaveLength(3);
    expect(nav).toContain('Parte Alfa &amp; Beta');
    expect(nav).not.toContain('>chapter<');
  });
  it('não copia URL maliciosa, com fallback para heading real', () => {
    const nav=buildNavDocument(metadata(),'OPS/nav.xhtml',
      resources(ncxText('javascript:alert(1)')));
    expect(nav).not.toContain('javascript:');
    expect(nav).toContain('Parte Alfa &amp; Beta');
    expect(analyze(nav).anchors).toHaveLength(1);
  });
  it('não inventa alvo quando NCX aponta para capítulo ausente', () => {
    const nav=buildNavDocument(metadata(),'OPS/nav.xhtml',
      resources(ncxText('Text/missing.xhtml#cap')));
    expect(nav).not.toContain('missing.xhtml');
    expect(analyze(nav).anchors).toHaveLength(1);
  });
  it('NCX corrompido não vira entrada executável', () => {
    const nav=buildNavDocument(metadata(),'OPS/nav.xhtml',
      resources(ncxText().replace('</navMap>','')));
    expect(nav).not.toContain('playOrder');
    expect(analyze(nav).anchors).toHaveLength(1);
  });
  it('reparo EPUB 3 sem NAV reaproveita NCX sem alterar XHTML ou NCX', async () => {
    const z=new JSZip();
    
    z.file('META-INF/container.xml',
      '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
      '<rootfiles><rootfile full-path="OPS/book.opf" ' +
      'media-type="application/oebps-package+xml"/></rootfiles></container>');
    z.file('OPS/book.opf',
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      '<dc:identifier id="uid">urn:uuid:nav-99</dc:identifier><dc:title>Editor</dc:title>' +
      '<dc:language>pt-BR</dc:language>' +
      '<meta property="dcterms:modified">2026-11-05T12:00:00Z</meta></metadata>' +
      '<manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' +
      '<item id="ch" href="Text/chapter.xhtml" media-type="application/xhtml+xml"/>' +
      '</manifest><spine toc="ncx"><itemref idref="ch"/></spine></package>');
    z.file('OPS/toc.ncx',ncxText());
    z.file('OPS/Text/chapter.xhtml',chapterXhtml);
    const bytes=await z.generateAsync({type:'uint8array',compression:'DEFLATE'});
    const result=await repairEpub('editorial.epub',bytes,
      {...DEFAULT_REPAIR_OPTIONS,conservativeMode:true});
    expect(result.changed).toBe(true);
    expect(result.blob).toBeDefined();
    expect(result.after.stats.fatalCount).toBe(0);
    const out=await JSZip.loadAsync(await result.blob!.arrayBuffer());
    expect(await out.file('OPS/Text/chapter.xhtml')!.async('string')).toBe(chapterXhtml);
    expect(await out.file('OPS/toc.ncx')!.async('string')).toBe(ncxText());
    const nav=await out.file('OPS/nav.xhtml')!.async('string');
    expect(analyze(nav).doc.getElementsByTagName('ol')).toHaveLength(3);
    expect(nav).toContain('Text/chapter.xhtml#sec');
  },30000);
});
