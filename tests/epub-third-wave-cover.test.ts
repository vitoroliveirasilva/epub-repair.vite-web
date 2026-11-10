
import { Blob as NodeBlob } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { replaceEpubCover } from '../src/epub/cover/replaceCover';
import { EPUB_MIME } from '../src/epub/utils/constants';
import { BASELINE_JPEG_BYTES } from './helpers/syntheticEpub';

const originalImage = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYk0AAAAASUVORK5CYII=', 'base64'));
function buildEpub(cssCover: boolean, imported = false): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', EPUB_MIME, {compression:'STORE'});
  zip.file('META-INF/container.xml', '<container version="1.0" ' +
    'xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles>' +
    '<rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/>' +
    '</rootfiles></container>');
  zip.file('OPS/book.opf','<package xmlns="http://www.idpf.org/2007/opf" version="3.0" ' +
    'unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:cover-scope-test</dc:identifier>' +
    '<dc:title>Teste</dc:title><dc:language>pt-BR</dc:language>' +
    '<meta property="dcterms:modified">2026-11-06T12:00:00Z</meta>' +
    '<meta name="cover" content="old"/></metadata><manifest>' +
    '<item id="old" href="Images/old.png" properties="cover-image" media-type="image/png"/>' +
    '<item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>' +
    '<item id="c" href="Text/0001.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="t" href="Text/chapter.xhtml" media-type="application/xhtml+xml"/>' +
    (cssCover ? '<item id="css" href="Styles/shared.css" media-type="text/css"/>' : '') +
    (imported ? '<item id="nested" href="Styles/nested.css" media-type="text/css"/>' : '') +
    '</manifest><spine><itemref idref="c"/><itemref idref="t"/></spine></package>');
  zip.file('OPS/nav.xhtml','<html xmlns="http://www.w3.org/1999/xhtml" ' +
    'xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Nav</title></head>' +
    '<body><nav epub:type="toc"><ol><li>' +
    '<a href="Text/chapter.xhtml">Capítulo</a></li></ol></nav></body></html>');
  zip.file('OPS/Images/old.png',originalImage);
  const sheet='<link rel="stylesheet" href="../Styles/shared.css"/>';
  zip.file('OPS/Text/0001.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head>' +
    '<title>Rosto</title>'+(cssCover?sheet:'')+'</head><body>' +
    (cssCover?'':'<img src="../Images/old.png" alt=""/>')+'</body></html>');
  zip.file('OPS/Text/chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head>' +
    '<title>Capítulo</title>'+(cssCover?sheet:'')+'</head><body>' +
    '<p>O texto original permanece.</p>' +
    (!cssCover?'<img src="../Images/old.png" alt="Ilustração"/>':'') +
    '</body></html>');
  if(cssCover)zip.file('OPS/Styles/shared.css', imported
    ? '@import "nested.css"; .caption:after{content:"url(old.png)"}'
    : '.cover{background-image:url("../Images/old.png")}' +
      '.caption:after{content:"url(old.png)"}');
  if(imported)zip.file('OPS/Styles/nested.css',
    '.cover{background-image:url("../Images/old.png")}');
  return zip.generateAsync({type:'uint8array'});
}
async function replace(cssCover: boolean, imported = false) {
  const input=await buildEpub(cssCover, imported);
  const cover={
    fileName:'nova.jpg',bytes:BASELINE_JPEG_BYTES,
    mediaType:'image/jpeg' as const,previewDataUrl:'',
  };
  vi.stubGlobal('Blob',NodeBlob);
  try {return await replaceEpubCover('scope.epub',input,cover);}
  finally {vi.unstubAllGlobals();}
}
describe('E-118 / E-119 / E-122: preservar capa visual e capítulos', () => {
  it('reconhece primeira página 0001.xhtml como capa, sem mudar ilustração de capítulo',async()=>{
    const result=await replace(false);
    const zip=await JSZip.loadAsync(await result.blob!.arrayBuffer());
    const cover=await zip.file('OPS/Text/0001.xhtml')!.async('string');
    const chapter=await zip.file('OPS/Text/chapter.xhtml')!.async('string');
    expect(cover).toContain('../Images/cover.jpg');
    expect(chapter).toContain('../Images/old.png');
    expect(chapter).toContain('O texto original permanece.');
    expect(await zip.file('OPS/Images/old.png')!.async('uint8array')).toEqual(originalImage);
  });
  it('E-127: acompanha @import com CSS compartilhado e preserva capítulos', async () => {
    const result = await replace(true, true);
    const zip = await JSZip.loadAsync(await result.blob!.arrayBuffer());
    const cover = await zip.file('OPS/Text/0001.xhtml')!.async('string');
    const chapter = await zip.file('OPS/Text/chapter.xhtml')!.async('string');
    const shared = await zip.file('OPS/Styles/shared.css')!.async('string');
    const nested = await zip.file('OPS/Styles/nested.css')!.async('string');
    const clonedShared = await zip.file('OPS/Styles/shared.epub-cover.css')!.async('string');
    const clonedNested = await zip.file('OPS/Styles/nested.epub-cover.css')!.async('string');
    expect(cover).toContain('../Styles/shared.epub-cover.css');
    expect(chapter).toContain('../Styles/shared.css');
    expect(chapter).toContain('O texto original permanece.');
    expect(shared).toContain('@import "nested.css"');
    expect(nested).toContain('../Images/old.png');
    expect(clonedShared).toContain('@import "nested.epub-cover.css"');
    expect(clonedNested).toContain('../Images/cover.jpg');
    expect(clonedShared).toContain('content:"url(old.png)"');
  });
  it('duplica folha CSS compartilhada somente para a página de rosto',async()=>{
    const result=await replace(true);
    const zip=await JSZip.loadAsync(await result.blob!.arrayBuffer());
    const cover=await zip.file('OPS/Text/0001.xhtml')!.async('string');
    const chapter=await zip.file('OPS/Text/chapter.xhtml')!.async('string');
    const oldCss=await zip.file('OPS/Styles/shared.css')!.async('string');
    const newCss=await zip.file('OPS/Styles/shared.epub-cover.css')!.async('string');
    const opf=await zip.file('OPS/book.opf')!.async('string');
    expect(cover).toContain('../Styles/shared.epub-cover.css');
    expect(chapter).toContain('../Styles/shared.css');
    expect(chapter).toContain('O texto original permanece.');
    expect(oldCss).toContain('../Images/old.png');
    expect(newCss).toContain('../Images/cover.jpg');
    expect(newCss).toContain('content:"url(old.png)"');
    expect(opf).toContain('Styles/shared.epub-cover.css');
    expect(result.actions.some(x=>x.title==='CSS independente da capa criado')).toBe(true);
  });
});
