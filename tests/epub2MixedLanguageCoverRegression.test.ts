// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { replaceEpubCover } from '../src/epub/cover/replaceCover';
import { repairEpub } from '../src/epub/repair/repairEpub';
import { repairKindleCompatibility, repairOptionalXhtmlLanguage } from
  '../src/epub/repair/repairKindleCompatibility';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { EPUB_MIME } from '../src/epub/utils/constants';
import { parseXml } from '../src/epub/utils/xmlUtils';
import { BASELINE_JPEG_BYTES } from './helpers/syntheticEpub';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const chapterPath = 'OPS/Text/page.xhtml';

function runLanguageNormalization(source: string, optional = false): string {
  const files = new Map([[chapterPath, encoder.encode(source)]]);
  const pkg = {
    version: '2.0', opfPath: 'OPS/book.opf', opfDir: 'OPS',
    metadata: { language: 'pt' }, manifest: [{
      id: 'page', href: 'Text/page.xhtml', resolvedPath: chapterPath,
      mediaType: 'application/xhtml+xml', properties: [], exists: true, pathSafe: true,
    }], spine: [], rootfileCount: 1,
  } as unknown as PackageDocumentInfo;
  if (optional) repairOptionalXhtmlLanguage(files, pkg);
  else repairKindleCompatibility(files, pkg, { conservativeMode: false });
  return decoder.decode(files.get(chapterPath));
}

function rootLanguage(markup: string): { lang: string | null; xmlLang: string | null } {
  const root = parseXml(markup, 'application/xhtml+xml').documentElement;
  return {
    lang: root.getAttribute('lang'),
    xmlLang: root.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang'),
  };
}

const html = (attributes: string) =>
  '<html xmlns="http://www.w3.org/1999/xhtml"' + attributes +
  '><head><title>Teste</title></head><body><p>Texto preservado.</p></body></html>';

describe('regressão real: idioma do OPF não deve sobrepor idioma da página', () => {
  it.each([false, true])(
    'preserva xml:lang="en" e completa lang="en" (otimização: %s)',
    (optional) => {
      const result = runLanguageNormalization(html(' xml:lang="en"'), optional);
      expect(rootLanguage(result)).toEqual({ lang: 'en', xmlLang: 'en' });
      expect(result).toContain('Texto preservado.');
    },
  );

  it.each([false, true])(
    'preserva lang="fr" e completa xml:lang="fr" (otimização: %s)',
    (optional) => {
      const result = runLanguageNormalization(html(' lang="fr"'), optional);
      expect(rootLanguage(result)).toEqual({ lang: 'fr', xmlLang: 'fr' });
    },
  );

  it('usa dc:language apenas quando a página não declara idioma', () => {
    expect(rootLanguage(runLanguageNormalization(html(''))))
      .toEqual({ lang: 'pt', xmlLang: 'pt' });
    expect(rootLanguage(runLanguageNormalization(html(' lang="" xml:lang=""'))))
      .toEqual({ lang: 'pt', xmlLang: 'pt' });
  });

  it('não mascara conflito já existente entre os dois atributos', () => {
    const conflicting = html(' lang="pt" xml:lang="en"');
    expect(runLanguageNormalization(conflicting)).toBe(conflicting);
    expect(runLanguageNormalization(conflicting, true)).toBe(conflicting);
  });
});

const doctype =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" ' +
  '"http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">';
const page = (attributes: string, body: string) =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' + doctype + '\n' +
  '<html xmlns="http://www.w3.org/1999/xhtml"' + attributes +
  '><head><title>Página sintética</title></head><body>' + body + '</body></html>';

async function makeEpub2WithMixedLanguages(): Promise<Uint8Array> {
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
    '<dc:title>Livro sintético multilíngue</dc:title>' +
    '<dc:identifier id="uid">urn:uuid:12345678-1234-1234-1234-123456789abc</dc:identifier>' +
    '<dc:language>pt</dc:language><meta name="cover" content="cover"/>' +
    '</metadata><manifest>' +
    '<item id="cover" href="Images/cover.jpeg" media-type="image/jpeg"/>' +
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' +
    '<item id="title" href="Text/titlepage.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="chapter" href="Text/chapter.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="copyright" href="Text/copyright.xhtml" media-type="application/xhtml+xml"/>' +
    '</manifest><spine toc="ncx"><itemref idref="title"/>' +
    '<itemref idref="copyright"/><itemref idref="chapter"/></spine>' +
    '<guide><reference type="cover" title="Capa" href="Text/titlepage.xhtml"/></guide>' +
    '</package>');
  zip.file('OPS/toc.ncx',
    '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">' +
    '<head><meta name="dtb:uid" content="urn:uuid:12345678-1234-1234-1234-123456789abc"/>' +
    '</head><docTitle><text>Livro sintético</text></docTitle><navMap>' +
    '<navPoint id="p1" playOrder="1"><navLabel><text>Capítulo</text></navLabel>' +
    '<content src="Text/chapter.xhtml"/></navPoint></navMap></ncx>');
  zip.file('OPS/Text/titlepage.xhtml', page(' xml:lang="en"',
    '<h1>Title page</h1><img src="../Images/cover.jpeg" alt="Cover"/>'));
  zip.file('OPS/Text/chapter.xhtml', page(' xml:lang="pt"',
    '<h1>Capítulo</h1><p>Conteúdo&nbsp;que precisa permanecer.</p>'));
  zip.file('OPS/Text/copyright.xhtml', page('',
    '<p>Copyright da fixture de teste.</p>'));
  zip.file('OPS/Images/cover.jpeg', BASELINE_JPEG_BYTES);
  return new Uint8Array(await zip.generateAsync({
    type: 'uint8array', compression: 'DEFLATE',
  }));
}

describe('EPUB 2 sintético que reproduz a ordem capa -> reparo do relatório', () => {
  it('troca capa sem adicionar properties EPUB 3 e repara NBSP sem conflito de idioma', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    try {
      const input = await makeEpub2WithMixedLanguages();
      const before = await inspectEpub('fixture.epub', input);
      expect(before.issues.some((issue) => issue.code === 'CONTENT_LANGUAGE_CONFLICT')).toBe(false);
      expect(before.issues.some((issue) => issue.code === 'XHTML_NBSP_ENTITY')).toBe(true);

      const changedCover = await replaceEpubCover('fixture.epub', input, {
        fileName: 'nova-capa.jpg',
        bytes: new Uint8Array(BASELINE_JPEG_BYTES),
        mediaType: 'image/jpeg',
        previewDataUrl: '',
      });
      expect(changedCover.changed).toBe(true);
      const coverBytes = new Uint8Array(await changedCover.blob!.arrayBuffer());
      const covered = await JSZip.loadAsync(coverBytes);
      const opf = parseXml(await covered.file('OPS/book.opf')!.async('string'));
      const items = Array.from(opf.getElementsByTagNameNS(
        'http://www.idpf.org/2007/opf', 'item'));
      expect(items.find((item) => item.getAttribute('id') === 'cover')
        ?.getAttribute('properties')).toBeNull();
      expect(Array.from(opf.getElementsByTagNameNS(
        'http://www.idpf.org/2007/opf', 'meta')).find(
        (item) => item.getAttribute('name') === 'cover')?.getAttribute('content')).toBe('cover');

      const repaired = await repairEpub('fixture-capa.epub', coverBytes);
      expect(repaired.changed).toBe(true);
      expect(repaired.after.issues.some((issue) =>
        issue.code === 'CONTENT_LANGUAGE_CONFLICT')).toBe(false);
      expect(repaired.after.issues.some((issue) =>
        issue.code === 'XHTML_NBSP_ENTITY')).toBe(false);
      const resultZip = await JSZip.loadAsync(await repaired.blob!.arrayBuffer());
      const title = await resultZip.file('OPS/Text/titlepage.xhtml')!.async('string');
      const chapter = await resultZip.file('OPS/Text/chapter.xhtml')!.async('string');
      const copyright = await resultZip.file('OPS/Text/copyright.xhtml')!.async('string');
      expect(rootLanguage(title)).toEqual({ lang: 'en', xmlLang: 'en' });
      expect(rootLanguage(chapter)).toEqual({ lang: 'pt', xmlLang: 'pt' });
      expect(rootLanguage(copyright)).toEqual({ lang: 'pt', xmlLang: 'pt' });
      expect(chapter).toContain('Conteúdo&#160;que precisa permanecer.');
      expect(title).toContain('Title page');
      expect(chapter).toContain('Capítulo');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
