// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { parsePackageDocument } from '../src/epub/validation/opfParser';
import { repairOpfDocument } from '../src/epub/repair/repairOpf';
import { replaceEpubCover } from '../src/epub/cover/replaceCover';
import { updateCoverReferences } from '../src/epub/cover/updateCoverReferences';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const enc = (value: string) => new TextEncoder().encode(value);
beforeAll(() => {
  if (typeof Blob.prototype.arrayBuffer === 'function') return;
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error('blob inválido'));
      reader.readAsArrayBuffer(this);
    });
  };
});

describe('E-106: documentos de navegação existentes jamais são sobrescritos', () => {
  it('gera caminho único se nav.xhtml não declarado já existe fisicamente', async () => {
    const zip = await JSZip.loadAsync(await buildKindleIssueEpub());
    const oldOpf = await zip.file('OEBPS/content.opf')!.async('string');
    zip.file('OEBPS/content.opf', oldOpf.replace('package xmlns="http://www.idpf.org/2007/opf" version="1.0"',
      'package xmlns="http://www.idpf.org/2007/opf" version="3.0"'));
    zip.file('OEBPS/nav.xhtml', '<html>Conteúdo de navegação órfão original</html>');
    const loaded = await loadEpub('teste.epub', new Uint8Array(
      await zip.generateAsync({type:'uint8array'})));
    const pkg = parsePackageDocument(loaded).packageInfo!;
    const result = repairOpfDocument(loaded, pkg, 'teste.epub', {
      ...DEFAULT_REPAIR_OPTIONS, repairManifest:false,
    });
    expect(result.filesToAdd.has('OEBPS/nav.xhtml')).toBe(false);
    expect(result.filesToAdd.has('OEBPS/nav-2.xhtml')).toBe(true);
    expect(new TextDecoder().decode(loaded.files.get('OEBPS/nav.xhtml')!.bytes))
      .toContain('órfão original');
  });

  it('gera toc-2.ncx em vez de substituir um NCX não declarado', async () => {
    const zip = await JSZip.loadAsync(await buildKindleIssueEpub());
    const oldOpf = await zip.file('OEBPS/content.opf')!.async('string');
    zip.file('OEBPS/content.opf', oldOpf.replace(
      /<item id="ncx"[^>]*\/>/u, ''));
    const loaded = await loadEpub('teste.epub', new Uint8Array(
      await zip.generateAsync({type:'uint8array'})));
    const pkg = parsePackageDocument(loaded).packageInfo!;
    const result = repairOpfDocument(loaded, pkg, 'teste.epub', {
      ...DEFAULT_REPAIR_OPTIONS, repairManifest:false,
    });
    expect(result.filesToAdd.has('OEBPS/toc.ncx')).toBe(false);
    expect(result.filesToAdd.has('OEBPS/toc-2.ncx')).toBe(true);
    expect(loaded.files.has('OEBPS/toc.ncx')).toBe(true);
  });
});

describe('E-107 / E-108: referências da capa sem modificar textos alheios', () => {
  const pkg = (paths: [string,string][]) => ({
    opfPath:'OPS/book.opf', opfDir:'OPS', version:'3.0',
    metadata:{}, rootfileCount:1, spine:[],
    manifest:paths.map(([path,mime],i)=>({
      id:'i'+i, href:path.slice(4), resolvedPath:path,
      mediaType:mime,exists:true,pathSafe:true,properties:[],
    })),
  } as unknown as PackageDocumentInfo);
  it('ignora XHTML legado não UTF-8 quando não menciona a capa', () => {
    const cover = 'OPS/Text/cover.xhtml';
    const legacy = 'OPS/Text/other.xhtml';
    const files = new Map<string, Uint8Array>([
      [cover,enc('<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
        '<img src="../Images/old.png"/></body></html>')],
      [legacy,Uint8Array.of(0xff,0xfe,0x00,0x42)],
    ]);
    expect(() => updateCoverReferences(files, pkg([
      [cover,'application/xhtml+xml'],[legacy,'application/xhtml+xml'],
    ]), 'OPS/Images/old.png','OPS/Images/new.jpg')).not.toThrow();
    expect(new TextDecoder().decode(files.get(cover))).toContain('new.jpg');
    expect(files.get(legacy)).toEqual(Uint8Array.of(0xff,0xfe,0,0x42));
  });
  it('atualiza URL CSS com parênteses e ignora comentário e string editorial', () => {
    const path = 'OPS/Styles/main.css';
    const css = '/* url("../Images/cover(2026).png") */' +
      '.cover{background:url("../Images/cover(2026).png")}' +
      '.caption:after{content:"url(../Images/cover(2026).png)"}';
    const files = new Map([[path,enc(css)]]);
    const actions = updateCoverReferences(files, pkg([[path,'text/css']]),
      'OPS/Images/cover(2026).png','OPS/Images/novo.jpg');
    expect(actions).toHaveLength(1);
    const result = new TextDecoder().decode(files.get(path));
    expect(result).toContain('/* url("../Images/cover(2026).png") */');
    expect(result).toContain('background:url("../Images/novo.jpg")');
    expect(result).toContain('content:"url(../Images/cover(2026).png)"');
  });
});

describe('E-104: imagens editoriais compartilhadas com a capa', () => {
  it('troca apenas a página de capa e o OPF, sem mudar a imagem de capítulos', async () => {
    const z = new JSZip();
    z.file('mimetype','application/epub+zip',{compression:'STORE'});
    z.file('META-INF/container.xml',
      '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
      '<rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/>' +
      '</rootfiles></container>');
    z.file('OPS/book.opf',
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      '<dc:identifier id="uid">urn:uuid:shared-cover</dc:identifier>' +
      '<dc:title>Teste</dc:title><dc:language>pt-BR</dc:language>' +
      '<meta property="dcterms:modified">2026-11-06T12:00:00Z</meta>' +
      '<meta name="cover" content="original"/></metadata><manifest>' +
      '<item id="original" href="Images/old.jpg" media-type="image/jpeg" properties="cover-image"/>' +
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
      '<item id="page" href="Text/cover.xhtml" media-type="application/xhtml+xml"/>' +
      '<item id="chapter" href="Text/chapter.xhtml" media-type="application/xhtml+xml"/>' +
      '</manifest><spine><itemref idref="page"/><itemref idref="chapter"/></spine>' +
      '<guide><reference type="cover" href="Text/cover.xhtml"/></guide></package>');
    z.file('OPS/Images/old.jpg',Uint8Array.of(0xff,0xd8,0xff,0xd9));
    z.file('OPS/nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml" ' +
      'xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Nav</title></head>' +
      '<body><nav epub:type="toc"><ol><li><a href="Text/chapter.xhtml">Capítulo</a>' +
      '</li></ol></nav></body></html>');
    z.file('OPS/Text/cover.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml">' +
      '<head><title>Capa</title></head><body><img src="../Images/old.jpg" alt="Capa"/></body></html>');
    z.file('OPS/Text/chapter.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml">' +
      '<head><title>Capítulo</title></head><body><p>Texto preservado</p>' +
      '<img src="../Images/old.jpg" alt="Ilustração"/></body></html>');
    const input = new Uint8Array(await z.generateAsync({type:'uint8array'}));
    const result = await replaceEpubCover('livro.epub',input,{
      fileName:'new.jpg',bytes:Uint8Array.of(0xff,0xd8,0xff,0xe0,0,2,0xff,0xd9),
      mediaType:'image/jpeg',previewDataUrl:'',
    });
    const out = await JSZip.loadAsync(await result.blob!.arrayBuffer());
    const cover = await out.file('OPS/Text/cover.xhtml')!.async('string');
    const chapter = await out.file('OPS/Text/chapter.xhtml')!.async('string');
    expect(cover).toContain('../Images/cover.jpg');
    expect(chapter).toContain('../Images/old.jpg');
    expect(chapter).toContain('Texto preservado');
    expect(await out.file('OPS/Images/old.jpg')!.async('uint8array'))
      .toEqual(Uint8Array.of(0xff,0xd8,0xff,0xd9));
    expect(result.warnings.some((w)=>w.includes('ilustrações foram preservadas'))).toBe(true);
  },30000);
});
