// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { replaceEpubCover } from '../src/epub/cover/replaceCover';
import { updateCoverGuideReference, updateCoverReferences } from '../src/epub/cover/updateCoverReferences';
import { parseXml } from '../src/epub/utils/xmlUtils';
import { EPUB_MIME } from '../src/epub/utils/constants';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const enc = new TextEncoder();
const dec = new TextDecoder();
const png = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYk0AAAAASUVORK5CYII=', 'base64'));

function packageInfo(): PackageDocumentInfo {
  const item = (path: string, mime: string) => ({
    id: path, href: path, resolvedPath: path, mediaType: mime,
    exists: true, pathSafe: true, properties: [],
  });
  return {
    opfPath: 'OPS/book.opf', opfDir: 'OPS', version: '3.0',
    metadata: {}, rootfileCount: 1, spine: [],
    manifest: [
      item('OPS/Text/cover.xhtml', 'application/xhtml+xml'),
      item('OPS/Text/ch.xhtml', 'application/xhtml+xml'),
      item('OPS/Styles/main.css', 'text/css'),
    ],
  };
}

describe('E-100: sincronização da capa sem alterar conteúdo editorial', () => {
  it('atualiza img, srcset, SVG e CSS sem alterar URLs externas ou links da obra', () => {
    const files = new Map<string, Uint8Array>([
      ['OPS/Text/cover.xhtml', enc.encode(
        '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml">' +
        '<head><style>.c{background:url("../Images/capa%20antiga.png")}</style></head>' +
        '<body><p>Texto intacto</p><img src="../Images/capa%20antiga.png" ' +
        'srcset="../Images/capa%20antiga.png 1x, https://site.test/capa.png 2x" ' +
        'alt="Capa"/><a href="ch.xhtml#inicio">Ler</a></body></html>')],
      ['OPS/Text/ch.xhtml', enc.encode(
        '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1 id="inicio">Capítulo</h1>' +
        '<img src="https://site.test/capa.png"/></body></html>')],
      ['OPS/Styles/main.css', enc.encode(
        '.cover { background-image: url("../Images/capa%20antiga.png"); } ' +
        '@font-face { src: url("https://cdn.test/font.woff2"); }')],
    ]);
    const originalChapter = files.get('OPS/Text/ch.xhtml');
    const actions = updateCoverReferences(files, packageInfo(),
      'OPS/Images/capa antiga.png', 'OPS/Images/cover.jpg');
    expect(actions.map((a) => a.file)).toEqual([
      'OPS/Text/cover.xhtml', 'OPS/Styles/main.css',
    ]);
    expect(files.get('OPS/Text/ch.xhtml')).toBe(originalChapter);
    const cover = dec.decode(files.get('OPS/Text/cover.xhtml'));
    expect(cover).toContain('../Images/cover.jpg');
    expect(cover).not.toContain('capa%20antiga.png');
    expect(cover).toContain('Texto intacto');
    expect(cover).toContain('ch.xhtml#inicio');
    expect(cover).toContain('https://site.test/capa.png');
    const css = dec.decode(files.get('OPS/Styles/main.css'));
    expect(css).toContain('../Images/cover.jpg');
    expect(css).toContain('https://cdn.test/font.woff2');
  });

  it('atualiza guide apenas quando apontar diretamente à imagem antiga', () => {
    const doc = parseXml('<package><guide><reference type="cover" href="Images/old.png"/>' +
      '<reference type="text" href="Text/start.xhtml"/></guide></package>');
    expect(updateCoverGuideReference(doc, 'OPS/book.opf', 'OPS/Images/old.png',
      'OPS/Images/new.jpg')).toBe(true);
    const refs = Array.from(doc.getElementsByTagName('reference'));
    expect(refs[0]?.getAttribute('href')).toBe('Images/new.jpg');
    expect(refs[1]?.getAttribute('href')).toBe('Text/start.xhtml');
  });

  it('repara EPUB completo com capa PNG→JPG e conserva página/índice', async () => {
    const z = new JSZip();
    z.file('mimetype', EPUB_MIME, {compression:'STORE'});
    z.file('META-INF/container.xml', '<container version="1.0" ' +
      'xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles>' +
      '<rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/>' +
      '</rootfiles></container>');
    z.file('OPS/book.opf', '<package xmlns="http://www.idpf.org/2007/opf" ' +
      'version="3.0" unique-identifier="uid"><metadata ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      '<dc:identifier id="uid">urn:uuid:cover-change</dc:identifier>' +
      '<dc:title>Teste</dc:title><dc:language>pt-BR</dc:language>' +
      '<meta property="dcterms:modified">2026-11-06T12:00:00Z</meta>' +
      '<meta name="cover" content="cover"/></metadata><manifest>' +
      '<item id="cover" href="Images/old.png" media-type="image/png" properties="cover-image"/>' +
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
      '<item id="page" href="Text/cover.xhtml" media-type="application/xhtml+xml"/>' +
      '</manifest><spine><itemref idref="page"/></spine></package>');
    z.file('OPS/Images/old.png',png);
    z.file('OPS/nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml" ' +
      'xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Nav</title></head>' +
      '<body><nav epub:type="toc"><ol><li><a href="Text/cover.xhtml">Capa</a>' +
      '</li></ol></nav></body></html>');
    z.file('OPS/Text/cover.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml">' +
      '<head><title>Capa</title></head><body><img src="../Images/old.png" ' +
      'alt="Capa"/><p>Texto protegido</p></body></html>');
    const input = new Uint8Array(await z.generateAsync({type:'uint8array'}));
    const replacement = {
      fileName:'novo.jpg',bytes:Uint8Array.of(0xff,0xd8,0xff,0xd9),
      mediaType:'image/jpeg' as const,previewDataUrl:'',
    };
    const output = await replaceEpubCover('livro.epub',input,replacement);
    expect(output.blob).toBeDefined();
    const out = await JSZip.loadAsync(await output.blob!.arrayBuffer());
    const page = await out.file('OPS/Text/cover.xhtml')!.async('string');
    const opf = await out.file('OPS/book.opf')!.async('string');
    const nav = await out.file('OPS/nav.xhtml')!.async('string');
    expect(page).toContain('../Images/cover.jpg');
    expect(page).toContain('Texto protegido');
    expect(opf).toContain('Images/cover.jpg');
    expect(nav).toContain('Text/cover.xhtml');
    expect(await out.file('OPS/Images/old.png')!.async('uint8array')).toEqual(png);
    expect(output.actions.some((action) =>
      action.title === 'Referência visual da capa atualizada')).toBe(true);
  });
});
