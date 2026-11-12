import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { readBookPreview, readBookMetadata, writeBookMetadata, type BookPreview } from '../src/epub/tools/bookTools';
import { compareBookPreviews, comparisonSummary } from '../src/epub/tools/bookComparison';
import { loadEpub } from '../src/epub/reader/loadEpub';

const pixel = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64'));

async function epubWithMedia(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0"?>
    <container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
      <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
    </container>`);
  zip.file('OEBPS/content.opf', `<?xml version="1.0"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="main">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>Livro de teste</dc:title>
        <dc:identifier id="secondary">ISBN-AUXILIAR</dc:identifier>
        <dc:identifier id="main">urn:uuid:11223344-1122-4122-8122-112233445566</dc:identifier>
        <dc:creator>Autora</dc:creator><dc:language>pt-BR</dc:language>
        <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
        <meta property="belongs-to-collection" id="series">Coleção A</meta>
        <meta property="group-position" refines="#series">2</meta>
      </metadata>
      <manifest>
        <item id="a" href="Text/a.xhtml" media-type="application/xhtml+xml"/>
        <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        <item id="pic" href="Images/pixel.png" media-type="image/png"/>
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
      </manifest>
      <spine toc="ncx"><itemref idref="a"/></spine>
    </package>`);
  zip.file('OEBPS/Text/a.xhtml', `<?xml version="1.0"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head><title>Início</title></head><body><h1>Início</h1>
      <p>Primeiro parágrafo com <strong>ênfase</strong>.<script>segredo-embutido</script></p>
      <figure><img src="../Images/pixel.png" alt="Imagem interna"/></figure>
      <img src="https://example.com/track.png" alt="Imagem remota"/>
      <script>segredo-do-script</script>
      </body></html>`);
  zip.file('OEBPS/Images/pixel.png', pixel);
  zip.file('OEBPS/nav.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"
    xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Sumário</title></head>
    <body><nav epub:type="toc"><ol><li><a href="Text/a.xhtml">Início</a></li></ol></nav></body></html>`);
  zip.file('OEBPS/toc.ncx', `<?xml version="1.0"?>
    <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
      <head><meta name="dtb:uid" content="urn:uuid:11223344-1122-4122-8122-112233445566"/></head>
      <docTitle><text>Livro</text></docTitle>
      <navMap><navPoint id="one" playOrder="1"><navLabel><text>Início</text></navLabel>
      <content src="Text/a.xhtml"/></navPoint></navMap>
    </ncx>`);
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
}

describe('Leitura EPUB segura e diferenças por capítulo', () => {
  it('preserva os blocos, imagens internas e exclui scripts/URLs externas', async () => {
    const bytes = await epubWithMedia();
    const book = await readBookPreview('obra.epub', bytes);
    const section = book.sections[0];
    expect(section?.title).toBe('Início');
    expect(section?.blocks?.some((block) => block.kind === 'heading')).toBe(true);
    expect(section?.blocks?.some((block) => block.kind === 'paragraph')).toBe(true);
    const images = section?.blocks?.filter((block) => block.kind === 'image') ?? [];
    expect(images).toHaveLength(1);
    expect(images[0]?.imageDataUrl).toMatch(/^data:image\/png;base64,/u);
    expect(JSON.stringify(book)).not.toContain('segredo-do-script');
    expect(JSON.stringify(book)).not.toContain('segredo-embutido');
    expect(JSON.stringify(book)).not.toContain('https://example.com');
  });

  it('mantém capítulos alinhados pelo caminho mesmo após reordenação', () => {
    const mk = (path: string, text: string) => ({ path, title: path, text, truncated: false });
    const before: BookPreview = { title: 'Teste', fixedLayout: false, omitted: 0,
      sections: [mk('A.xhtml', 'texto A'), mk('B.xhtml', 'texto B')] };
    const after: BookPreview = { title: 'Teste', fixedLayout: false, omitted: 0,
      sections: [mk('B.xhtml', 'texto B'), mk('A.xhtml', 'texto A alterado'),
        mk('C.xhtml', 'novo capítulo')] };
    const diffs = compareBookPreviews(before, after);
    expect(diffs.map((diff) => diff.status)).toEqual(['same', 'text-changed', 'added']);
    expect(diffs[1]?.addedWords).toBeGreaterThan(0);
    expect(comparisonSummary(diffs)).toContain('1 alterada');
  });

  it('identifica seções removidas sem parear por posição incorreta', () => {
    const before: BookPreview = { title: 'Teste', fixedLayout: false, omitted: 0,
      sections: [{ path: 'a', title: 'A', text: 'Texto A', truncated: false },
        { path: 'b', title: 'B', text: 'Texto B', truncated: false }] };
    const after: BookPreview = { title: 'Teste', fixedLayout: false, omitted: 0, sections: [] };
    expect(compareBookPreviews(before, after).map((diff) => diff.status)).toEqual(['removed', 'removed']);
  });
});

describe('Editor de metadados não destrutivo', () => {
  it('usa identificador principal, preserva secundários e atualiza UID do NCX', async () => {
    const bytes = await epubWithMedia();
    const existing = await readBookMetadata('obra.epub', bytes);
    expect(existing.identifier).toBe('urn:uuid:11223344-1122-4122-8122-112233445566');
    expect(existing.seriesIndex).toBe('2');
    const changed = await writeBookMetadata('obra.epub', bytes, {
      title: 'Obra editada', identifier: 'urn:uuid:55223344-1122-4122-8122-112233445566',
    });
    const loaded = await loadEpub(changed.fileName, changed.bytes);
    const opf = new TextDecoder().decode(loaded.files.get('OEBPS/content.opf')!.bytes);
    const ncx = new TextDecoder().decode(loaded.files.get('OEBPS/toc.ncx')!.bytes);
    expect(opf).toContain('ISBN-AUXILIAR');
    expect(opf).toContain('55223344-1122-4122-8122-112233445566');
    expect(ncx).toContain('55223344-1122-4122-8122-112233445566');
    expect(new TextDecoder().decode(bytes)).not.toContain('Obra editada');
  });

  it('não gera uma cópia quando valores preenchidos permanecem inalterados', async () => {
    const bytes = await epubWithMedia();
    await expect(writeBookMetadata('obra.epub', bytes, { title: 'Livro de teste',
      series: 'Coleção A', seriesIndex: '2' })).rejects.toThrow('Nenhuma alteração');
  });
});
