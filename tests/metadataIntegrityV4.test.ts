import { Blob as NodeBlob } from 'node:buffer';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { additionalCreatorRoles, updateAdditionalCreators,
  updateAdditionalCreatorRoles } from '../src/epub/tools/metadataContributors';
import { readBookMetadata, writeBookMetadata } from '../src/epub/tools/bookTools';
import { parseXml } from '../src/epub/utils/xmlUtils';

const DC = 'http://purl.org/dc/elements/1.1/';
const OPF = 'http://www.idpf.org/2007/opf';
const decoder = new TextDecoder();

function xml(credits: string, version = '3.0'): Document {
  return parseXml('<package xmlns="' + OPF + '" xmlns:dc="' + DC +
    '" xmlns:opf="' + OPF + '" version="' + version + '"><metadata>' +
    '<dc:creator id="main">Autora</dc:creator>' + credits + '</metadata></package>');
}
function meta(doc: Document): Element {
  return Array.from(doc.getElementsByTagName('*')).find((node) =>
    node.localName === 'metadata')!;
}
function creators(doc: Document): Element[] {
  return Array.from(meta(doc).children).filter((node) => node.localName === 'creator');
}
function refinements(doc: Document, id: string): Element[] {
  return Array.from(meta(doc).children).filter((node) =>
    node.getAttribute('refines') === '#' + id);
}

describe('Preservação dos vínculos editoriais EPUB 2/3', () => {
  it('reordena autores preservando seus IDs, funções e refinamentos no EPUB 3', () => {
    const doc = xml('<dc:creator id="tradutora">Beatriz</dc:creator>' +
      '<dc:creator id="ilustradora">Camila</dc:creator>' +
      '<meta property="role" refines="#tradutora" scheme="marc:relators">trl</meta>' +
      '<meta property="role" refines="#ilustradora" scheme="marc:relators">ill</meta>' +
      '<meta property="file-as" refines="#tradutora">Beatriz, B</meta>');
    expect(updateAdditionalCreators(doc, meta(doc), 'Camila\nBeatriz')).toBe(true);
    expect(creators(doc).slice(1).map((node) => [node.textContent, node.getAttribute('id')]))
      .toEqual([['Camila', 'ilustradora'], ['Beatriz', 'tradutora']]);
    expect(refinements(doc, 'tradutora').map((node) => node.textContent))
      .toEqual(['trl', 'Beatriz, B']);
    expect(refinements(doc, 'ilustradora')[0]?.textContent).toBe('ill');
    expect(additionalCreatorRoles(meta(doc))).toBe('ill\ntrl');
  });

  it('não exclui nem reatribui silenciosamente um autor com refinamentos', () => {
    const doc = xml('<dc:creator id="editor">Breno</dc:creator>' +
      '<dc:creator>Carla</dc:creator>' +
      '<meta property="role" refines="#editor">edt</meta>');
    const before = new XMLSerializer().serializeToString(doc);
    expect(() => updateAdditionalCreators(doc, meta(doc), 'Carla'))
      .toThrow(/função editorial|refinamentos/u);
    expect(new XMLSerializer().serializeToString(doc)).toBe(before);
    expect(() => updateAdditionalCreators(doc, meta(doc), 'Breno\nAna')).not.toThrow();
    expect(refinements(doc, 'editor')[0]?.textContent).toBe('edt');
  });

  it('preserva funções por atributo EPUB 2 e associa nova função a um autor específico', () => {
    const doc = xml('<dc:creator id="tradutor" opf:role="trl">Tadeu</dc:creator>' +
      '<dc:creator>Ana</dc:creator><dc:contributor>Revisora técnica</dc:contributor>', '2.0');
    expect(updateAdditionalCreators(doc, meta(doc), 'Ana\nTadeu')).toBe(true);
    expect(additionalCreatorRoles(meta(doc))).toBe('\ntrl');
    expect(updateAdditionalCreatorRoles(doc, meta(doc), 'ill\ntrl', false)).toBe(true);
    expect(creators(doc)[1]?.getAttributeNS(OPF, 'role')).toBe('ill');
    expect(creators(doc)[2]?.getAttributeNS(OPF, 'role')).toBe('trl');
    expect(doc.getElementsByTagNameNS(DC, 'contributor')[0]?.textContent)
      .toBe('Revisora técnica');
  });

  it('cria funções MARC refinadas com ID exclusivo no EPUB 3 e valida a lista', () => {
    const doc = xml('<dc:creator>Ana</dc:creator><dc:creator>Bia</dc:creator>' +
      '<meta id="epub-repair-credit" property="other">Original</meta>');
    expect(updateAdditionalCreatorRoles(doc, meta(doc), 'edt\ntrl', true)).toBe(true);
    const first = creators(doc)[1]!;
    expect(first.getAttribute('id')).toBe('epub-repair-credit-2');
    expect(refinements(doc, first.getAttribute('id')!)[0]?.textContent).toBe('edt');
    expect(additionalCreatorRoles(meta(doc))).toBe('edt\ntrl');
    expect(updateAdditionalCreatorRoles(doc, meta(doc), '', true)).toBe(false);
    expect(() => updateAdditionalCreatorRoles(doc, meta(doc), 'editor\ntrl', true))
      .toThrow(/três letras/u);
  });
});

async function makeBook(version: '2.0' | '3.0'): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml',
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" ' +
    'media-type="application/oebps-package+xml"/></rootfiles></container>');
  const meta = version === '3.0'
    ? '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>' +
      '<meta id="serie-principal" property="belongs-to-collection">Trilogia A</meta>' +
      '<meta id="serie-secundaria" property="belongs-to-collection">Obras reunidas</meta>' +
      '<meta property="group-position" refines="#serie-secundaria">7</meta>' +
      '<meta property="group-position" refines="#serie-principal">2</meta>' +
      '<meta property="role" refines="#refinado" scheme="marc:relators">trl</meta>'
    : '<meta name="calibre:series" content="Trilogia A"/>' +
      '<meta name="calibre:series_index" content="2"/>';
  const nav = version === '3.0'
    ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
    : '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>';
  const spine = version === '3.0' ? '' : ' toc="ncx"';
  const opf = '<?xml version="1.0"?><package xmlns="' + OPF +
    '" xmlns:dc="' + DC + '" xmlns:opf="' + OPF + '" version="' + version +
    '" unique-identifier="primary"><metadata>' +
    '<dc:title>Livro completo</dc:title><dc:language>pt-BR</dc:language>' +
    '<dc:identifier id="primary">urn:uuid:11111111-1111-4111-8111-111111111111</dc:identifier>' +
    '<dc:identifier id="isbn">9781234567897</dc:identifier>' +
    '<dc:creator id="main">Autora principal</dc:creator>' +
    '<dc:creator id="refinado">Tradutora</dc:creator>' +
    '<dc:creator id="extra">Editora</dc:creator>' + meta +
    '</metadata><manifest>' + nav +
    '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
    '</manifest><spine' + spine + '><itemref idref="chapter"/></spine></package>';
  zip.file('OPS/book.opf', opf);
  zip.file('OPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Capítulo</title></head>' +
    '<body><p>Texto preservado na saída.</p></body></html>');
  if (version === '3.0') {
    zip.file('OPS/nav.xhtml',
      '<html xmlns="http://www.w3.org/1999/xhtml" ' +
      'xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Sumário</title></head>' +
      '<body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Capítulo</a></li>' +
      '</ol></nav></body></html>');
  } else {
    zip.file('OPS/toc.ncx',
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">' +
      '<head><meta name="dtb:uid" content="urn:uuid:11111111-1111-4111-8111-111111111111"/>' +
      '</head><docTitle><text>Livro completo</text></docTitle><navMap>' +
      '<navPoint id="n1" playOrder="1"><navLabel><text>Capítulo</text></navLabel>' +
      '<content src="chapter.xhtml"/></navPoint></navMap></ncx>');
  }
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
}

beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
afterEach(() => vi.unstubAllGlobals());

describe('Edição real de pacotes EPUB e preservação OPF/NCX', () => {
  it('edita a posição só da série selecionada, preserva outras coleções e refinamentos', async () => {
    const bytes = await makeBook('3.0');
    const original = await readBookMetadata('multi.epub', bytes);
    expect(original.series).toBe('Trilogia A');
    expect(original.seriesIndex).toBe('2');
    expect(original.additionalCreatorRoles).toBe('trl\n');
    const changed = await writeBookMetadata('multi.epub', bytes,
      { series: 'Trilogia B', seriesIndex: '4',
        additionalCreators: 'Editora\nTradutora', additionalCreatorRoles: 'edt\ntrl' });
    expect(changed.report.validZip).toBe(true);
    expect(changed.report.stats.fatalCount).toBe(0);
    const zip = await JSZip.loadAsync(changed.bytes);
    const doc = parseXml(await zip.file('OPS/book.opf')!.async('string'));
    const metaNodes = Array.from(doc.getElementsByTagName('*')).filter((node) =>
      node.localName === 'meta');
    const mainPosition = metaNodes.find((node) => node.getAttribute('property') ===
      'group-position' && node.getAttribute('refines') === '#serie-principal');
    const secondaryPosition = metaNodes.find((node) => node.getAttribute('property') ===
      'group-position' && node.getAttribute('refines') === '#serie-secundaria');
    expect(mainPosition?.textContent).toBe('4');
    expect(secondaryPosition?.textContent).toBe('7');
    expect(creators(doc).slice(1).map((node) => node.getAttribute('id')))
      .toEqual(['extra', 'refinado']);
    expect(refinements(doc, 'refinado').find((node) =>
      node.getAttribute('property') === 'role')?.textContent).toBe('trl');
    expect(await zip.file('OPS/chapter.xhtml')!.async('string'))
      .toContain('Texto preservado na saída.');
    expect((await readBookMetadata('edited.epub', changed.bytes)).seriesIndex).toBe('4');
  });

  it('atualiza UID de NCX no EPUB 2 sem apagar o identificador secundário', async () => {
    const bytes = await makeBook('2.0');
    const changed = await writeBookMetadata('livro.epub', bytes,
      { identifier: 'urn:uuid:22222222-2222-4222-8222-222222222222',
        additionalCreatorRoles: 'trl\nedt', seriesIndex: '5' });
    const zip = await JSZip.loadAsync(changed.bytes);
    const opf = parseXml(await zip.file('OPS/book.opf')!.async('string'));
    const ncx = parseXml(await zip.file('OPS/toc.ncx')!.async('string'));
    const ids = Array.from(opf.getElementsByTagNameNS(DC, 'identifier'));
    expect(ids).toHaveLength(2);
    expect(ids[0]?.textContent).toBe('urn:uuid:22222222-2222-4222-8222-222222222222');
    expect(ids[1]?.textContent).toBe('9781234567897');
    const uid = Array.from(ncx.getElementsByTagName('*')).find((node) =>
      node.localName === 'meta' && node.getAttribute('name') === 'dtb:uid');
    expect(uid?.getAttribute('content')).toBe('urn:uuid:22222222-2222-4222-8222-222222222222');
    expect(creators(opf)[1]?.getAttributeNS(OPF, 'role')).toBe('trl');
    expect(creators(opf)[2]?.getAttributeNS(OPF, 'role')).toBe('edt');
  });

  it('rejeita edição de EPUB protegido por assinatura digital, preservando bytes', async () => {
    const original = await makeBook('3.0');
    const zip = await JSZip.loadAsync(original);
    zip.file('META-INF/signatures.xml', '<signatures/>');
    const bytes = new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
    await expect(writeBookMetadata('assinado.epub', bytes, { title: 'Não editar' }))
      .rejects.toThrow(/assinatura digital/u);
    const check = await JSZip.loadAsync(bytes);
    expect(await check.file('OPS/book.opf')!.async('string')).toContain('Livro completo');
  });
});
