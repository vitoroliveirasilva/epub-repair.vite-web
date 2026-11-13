import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { readBookPreview } from '../src/epub/tools/bookTools';
import { readerCard } from '../src/ui/optionalEpubTools';
import { readSafeTable } from '../src/epub/tools/readerStructures';
import { compareBookPreviews } from '../src/epub/tools/bookComparison';
import { comparisonCards } from '../src/ui/optionalEpubTools';

const pixel = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
  'base64'));

async function book(xhtml: string, fixedLayout = false): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml',
    '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
    '<rootfiles><rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml"/>' +
    '</rootfiles></container>');
  zip.file('OPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" ' +
    'version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:title>Livro estruturado</dc:title><dc:language>pt-BR</dc:language>' +
    '<dc:identifier id="uid">urn:uuid:12345678-1234-4123-8123-123456789abc</dc:identifier>' +
    '<meta property="dcterms:modified">2026-11-12T00:00:00Z</meta>' +
    (fixedLayout ? '<meta property="rendition:layout">pre-paginated</meta>' : '') +
    '</metadata><manifest>' +
    '<item id="a" href="Text/chapter.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
    '<item id="img" href="Images/pixel.png" media-type="image/png"/>' +
    '</manifest><spine><itemref idref="a"/></spine></package>');
  zip.file('OPS/nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml" ' +
    'xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Sumário</title></head>' +
    '<body><nav epub:type="toc"><ol><li><a href="Text/chapter.xhtml">Capítulo</a></li></ol>' +
    '</nav></body></html>');
  zip.file('OPS/Text/chapter.xhtml', '<?xml version="1.0"?>' +
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
    '<head><title>Leitura</title></head><body><h1>Capítulo</h1>' + xhtml + '</body></html>');
  zip.file('OPS/Images/pixel.png', pixel);
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
}

describe('Visualizador EPUB: tabelas e notas de rodapé', () => {
  it('mantém cabeçalhos, fusões e ênfases de tabelas sem duplicar conteúdo', async () => {
    const bytes = await book('<table><caption>Comparativo</caption>' +
      '<thead><tr><th>Item</th><th colspan="2">Valores</th></tr></thead>' +
      '<tbody><tr><th rowspan="2">Café</th><td><strong>Doce</strong></td><td>100</td></tr>' +
      '<tr><td>Equilibrado</td><td>200</td></tr></tbody></table>' +
      '<p>Depois da tabela.</p>');
    const preview = await readBookPreview('tabelas.epub', bytes);
    const sec = preview.sections[0]!;
    const tables = sec.blocks?.filter((b) => b.kind === 'table') ?? [];
    expect(tables).toHaveLength(1);
    expect(tables[0]?.table?.caption).toBe('Comparativo');
    expect(tables[0]?.table?.rows).toHaveLength(3);
    expect(tables[0]?.table?.rows[0]?.[1]?.colspan).toBe(2);
    expect(tables[0]?.table?.rows[1]?.[0]?.rowspan).toBe(2);
    expect(tables[0]?.table?.rows[1]?.[1]?.runs[0]?.marks).toContain('strong');
    expect(sec.text.match(/Equilibrado/gu)).toHaveLength(1);
    expect(sec.blocks?.at(-1)?.text).toContain('Depois da tabela.');
  });

  it('usa nota recolhível com referência interna e não executa conteúdo ativo', async () => {
    const bytes = await book('<p>Texto completo<a epub:type="noteref" href="#nota-a"><sup>1</sup></a>.' +
      '<a href="https://example.com/tracker">Não carregar rede</a></p>' +
      '<aside epub:type="footnote" id="nota-a"><p>Explicação com <em>ênfase</em>.</p>' +
      '<script>invasao-do-script()</script></aside>' +
      '<img src="https://example.com/track.png" alt="rastreador" />' +
      '<img src="../Images/pixel.png" alt="Ilustração local" />');
    const sec = (await readBookPreview('notas.epub', bytes)).sections[0]!;
    const runs = sec.blocks?.find((b) => b.kind === 'paragraph')?.runs ?? [];
    expect(runs.find((run) => run.text === '1')?.hrefId).toBe('nota-a');
    const notes = sec.blocks?.filter((block) => block.kind === 'footnote') ?? [];
    expect(notes).toHaveLength(1);
    expect(notes[0]?.text).toContain('Explicação com ênfase');
    expect(sec.text).not.toContain('invasao-do-script');
    expect(JSON.stringify(sec)).not.toContain('https://example.com');
    expect(sec.blocks?.filter((b) => b.kind === 'image')).toHaveLength(1);
    const dom = readerCard(sec, 18, 'Prévia do capítulo');
    expect(dom.querySelectorAll('table')).toHaveLength(0);
    const button = dom.querySelector<HTMLButtonElement>('.optional-reader-noteref');
    const note = dom.querySelector<HTMLDetailsElement>('.optional-reader-footnote');
    expect(button).not.toBeNull();
    expect(note?.open).toBe(false);
    button?.click();
    expect(note?.open).toBe(true);
    expect(dom.querySelectorAll('script')).toHaveLength(0);
    expect(dom.querySelectorAll('a[href^="https"]')).toHaveLength(0);
    expect(dom.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/u);
  });

  it('renderiza tabela sem HTML bruto e com região de rolagem acessível', async () => {
    const preview = await readBookPreview('table.epub', await book(
      '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>'));
    const rendered = readerCard(preview.sections[0]!, 20, 'Leitura');
    expect(rendered.querySelectorAll('table')).toHaveLength(1);
    expect(rendered.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(rendered.querySelectorAll('th')).toHaveLength(2);
    expect(rendered.querySelector('.optional-reader-table-scroll')
      ?.getAttribute('tabindex')).toBe('0');
  });

  it('limita tabelas gigantes e impede atributos de layout excessivos', () => {
    const xml = new DOMParser().parseFromString(
      '<table>' + '<tr><td colspan="500">valor</td></tr>'.repeat(100) + '</table>',
      'application/xml');
    const table = readSafeTable(xml.documentElement);
    expect(table.rows).toHaveLength(70);
    expect(table.rows[0]?.[0]?.colspan).toBe(1);
    expect(table.truncated).toBe(true);
  });

  it('mostra imagens de EPUB de layout fixo em modo simplificado, sem declarar fidelidade', async () => {
    const preview = await readBookPreview('fixed.epub', await book(
      '<div><img src="../Images/pixel.png" alt="Página visual" /></div>', true));
    expect(preview.fixedLayout).toBe(true);
    expect(preview.sections[0]?.blocks?.some((block) => block.kind === 'image')).toBe(true);
    const rendered = readerCard(preview.sections[0]!, 18, 'Prévia simplificada');
    expect(rendered.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/u);
    expect(rendered.querySelectorAll('iframe,script,link')).toHaveLength(0);
  });

  it('não cria links executáveis de texto XHTML injetado', async () => {
    const preview = await readBookPreview('safe.epub', await book(
      '<p>Seguro <a href="javascript:alert(1)">clique</a> e ' +
      '<a href="../../evil.xhtml">inseguro</a></p>'));
    const dom = readerCard(preview.sections[0]!, 18, 'Segurança');
    expect(dom.textContent).toContain('clique');
    expect(dom.querySelectorAll('a,iframe,script')).toHaveLength(0);
  });
  it('detecta mudanças apenas no CSS local, sem executar esse CSS na prévia', async () => {
    const zip = await JSZip.loadAsync(await book('<p class="capitulo">Texto inalterado.</p>'));
    const path = 'OPS/Text/chapter.xhtml';
    const chapter = await zip.file(path)!.async('string');
    zip.file(path, chapter.replace('</head>',
      '<link rel="stylesheet" href="../Styles/theme.css" /></head>'));
    zip.file('OPS/Styles/theme.css', '.capitulo { font-weight: normal; }');
    const first = await readBookPreview('primeiro.epub',
      new Uint8Array(await zip.generateAsync({ type: 'uint8array' })));
    zip.file('OPS/Styles/theme.css', '.capitulo { font-weight: bold; }');
    const second = await readBookPreview('segundo.epub',
      new Uint8Array(await zip.generateAsync({ type: 'uint8array' })));
    const [difference] = compareBookPreviews(first, second);
    expect(first.sections[0]?.text).toBe(second.sections[0]?.text);
    expect(first.sections[0]?.styleFingerprint).not.toBe('');
    expect(difference?.status).toBe('style-changed');
    const dom = readerCard(first.sections[0]!, 18, 'Leitura');
    expect(dom.querySelectorAll('link,style,iframe,script')).toHaveLength(0);
  });

  it('mantém referência à imagem em célula da tabela sem permitir URL remota', async () => {
    const bytes = await book('<table><tr><th>Ilustração</th></tr><tr><td>' +
      '<img src="../Images/pixel.png" alt="Foto da tabela" />' +
      '<img src="https://example.org/spy.jpg" alt="Rastreador" />' +
      '</td></tr></table>');
    const section = (await readBookPreview('tabela.epub', bytes)).sections[0]!;
    expect(section.blocks?.filter((block) => block.kind === 'table')).toHaveLength(1);
    const images = section.blocks?.filter((block) => block.kind === 'image') ?? [];
    expect(images).toHaveLength(0);
    const cellImages = section.blocks?.find((block) => block.kind === 'table')
      ?.table?.rows[1]?.[0]?.images ?? [];
    expect(cellImages).toHaveLength(1);
    expect(cellImages[0]?.text).toBe('Foto da tabela');
    expect(JSON.stringify(section)).not.toContain('https://example.org');
    const dom = readerCard(section, 18, 'Tabela');
    expect(dom.querySelectorAll('td img')).toHaveLength(1);
    expect(dom.querySelectorAll('.optional-reader-figure')).toHaveLength(0);
  });

  it('aplica propriedades de estilo previamente validadas sem carregar CSS ativo', async () => {
    const zip = await JSZip.loadAsync(await book(
      '<p class="capitulo">Texto com <span class="destaque">ênfase CSS</span>.</p>'));
    const path = 'OPS/Text/chapter.xhtml';
    const xhtml = await zip.file(path)!.async('string');
    zip.file(path, xhtml.replace('</head>',
      '<link rel="stylesheet" href="../Styles/theme.css" /></head>'));
    zip.file('OPS/Styles/theme.css',
      'p.capitulo { text-align: justify; text-indent: 1.2em;' +
      ' font-family: sans-serif; line-height: 1.65; margin-bottom: 1.5em; }' +
      '.destaque { font-weight: bold; font-style: italic; }');
    const preview = await readBookPreview('estilo.epub',
      new Uint8Array(await zip.generateAsync({ type: 'uint8array' })));
    const para = preview.sections[0]?.blocks?.find((block) =>
      block.kind === 'paragraph' && block.text.includes('Texto com'));
    expect(para?.presentation).toMatchObject({
      align: 'justify', indentEm: 1.2, fontFamily: 'sans-serif',
      lineHeight: 1.65, afterEm: 1.5,
    });
    expect(para?.runs?.find((run) => run.text.includes('ênfase CSS'))?.marks)
      .toEqual(expect.arrayContaining(['strong', 'emphasis']));
    const dom = readerCard(preview.sections[0]!, 18, 'Leitura');
    const actual = Array.from(dom.querySelectorAll<HTMLElement>('p')).find((node) =>
      node.textContent.includes('Texto com'));
    expect(actual?.style.textAlign).toBe('justify');
    expect(actual?.style.textIndent).toBe('1.2em');
    expect(actual?.style.fontFamily).toBe('sans-serif');
    expect(actual?.style.lineHeight).toBe('1.65');
    expect(actual?.querySelector('strong em, em strong')).not.toBeNull();
    expect(dom.querySelectorAll('link, style, iframe, script')).toHaveLength(0);
  });

  it('descarta regras inseguras e limites exagerados sem executar CSS fornecido pelo EPUB', async () => {
    const zip = await JSZip.loadAsync(await book('<p class="evil">Texto seguro.</p>'));
    const path = 'OPS/Text/chapter.xhtml';
    const xhtml = await zip.file(path)!.async('string');
    zip.file(path, xhtml.replace('</head>',
      '<style>.evil { position: fixed; background: url(https://bad.example/x.png);' +
      ' font-size: 200em; text-align: center; text-indent: -500em; }' +
      ' @import url("https://bad.example/spy.css");</style></head>'));
    const preview = await readBookPreview('seguro.epub',
      new Uint8Array(await zip.generateAsync({ type: 'uint8array' })));
    const block = preview.sections[0]?.blocks?.find((item) => item.kind === 'paragraph');
    expect(block?.presentation).toMatchObject({ align: 'center' });
    expect(block?.presentation).not.toHaveProperty('fontSizeEm');
    expect(block?.presentation).not.toHaveProperty('indentEm');
    const rendered = readerCard(preview.sections[0]!, 18, 'Leitura');
    const safe = rendered.querySelector<HTMLElement>('p.optional-reader-paragraph');
    expect(safe?.style.position).toBe('');
    expect(safe?.style.backgroundImage).toBe('');
    expect(safe?.style.textAlign).toBe('center');
    expect(JSON.stringify(preview)).not.toContain('bad.example');
  });

  it('detecta imagem substituída dentro de tabela sem alteração no texto', async () => {
    const before = await readBookPreview('a.epub', await book(
      '<table><tr><td><img src="../Images/pixel.png" alt="Capa A" /></td></tr></table>'));
    const after = await readBookPreview('b.epub', await book(
      '<table><tr><td><img src="../Images/pixel.png" alt="Capa B" /></td></tr></table>'));
    const [row] = compareBookPreviews(before, after);
    expect(row?.status).toBe('images-changed');
    expect(row?.aspects).toContain('images');
    expect(row?.aspects).not.toContain('text');
  });

  it('permite navegação segura até uma nota em outro arquivo do spine', async () => {
    const zip = await JSZip.loadAsync(await book(
      '<p>Veja a <a href="notas.xhtml#nota-final"><sup>2</sup></a> para detalhes.</p>'));
    const opf = await zip.file('OPS/content.opf')!.async('string');
    zip.file('OPS/content.opf', opf
      .replace('</manifest>', '<item id="notes" href="Text/notas.xhtml"' +
        ' media-type="application/xhtml+xml"/></manifest>')
      .replace('</spine>', '<itemref idref="notes"/></spine>'));
    zip.file('OPS/Text/notas.xhtml',
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
      '<head><title>Notas</title></head><body><aside epub:type="footnote" id="nota-final">' +
      '<p>Nota preservada em outro capítulo.</p></aside></body></html>');
    const preview = await readBookPreview('notas-externas.epub',
      new Uint8Array(await zip.generateAsync({ type: 'uint8array' })));
    expect(preview.sections).toHaveLength(2);
    const ref = preview.sections[0]?.blocks?.find((block) => block.kind === 'paragraph')
      ?.runs?.find((run) => run.text === '2');
    expect(ref?.hrefId).toBe('nota-final');
    expect(ref?.hrefPath).toBe('OPS/Text/notas.xhtml');
    const target = preview.sections[1]?.blocks?.find((block) => block.kind === 'footnote');
    expect(target?.noteId).toBe('nota-final');
    let opened = '';
    const rendered = readerCard(preview.sections[0]!, 18, 'Texto', {
      knownNotes: new Set(['OPS/Text/notas.xhtml#nota-final']),
      onOpenNote: (path, id) => { opened = path + '#' + id; },
    });
    rendered.querySelector<HTMLButtonElement>('.optional-reader-noteref')?.click();
    expect(opened).toBe('OPS/Text/notas.xhtml#nota-final');
    expect(rendered.querySelectorAll('a[href]')).toHaveLength(0);
  });

  it('permite pré-visualizar livro com mais de oitenta capítulos com orçamento global', async () => {
    const zip = await JSZip.loadAsync(await book('<p>Capítulo zero.</p>'));
    let opf = await zip.file('OPS/content.opf')!.async('string');
    let manifest = '';
    let spine = '';
    for (let i = 1; i <= 84; i += 1) {
      manifest += '<item id="chapter-' + i + '" href="Text/chapter-' + i +
        '.xhtml" media-type="application/xhtml+xml"/>';
      spine += '<itemref idref="chapter-' + i + '"/>';
      zip.file('OPS/Text/chapter-' + i + '.xhtml',
        '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Capítulo ' +
        i + '</title></head><body><p>Texto único da seção ' + i + '.</p></body></html>');
    }
    opf = opf.replace('</manifest>', manifest + '</manifest>');
    opf = opf.replace('</spine>', spine + '</spine>');
    zip.file('OPS/content.opf', opf);
    const preview = await readBookPreview('livro-longo.epub',
      new Uint8Array(await zip.generateAsync({ type: 'uint8array' })));
    expect(preview.sections).toHaveLength(85);
    expect(preview.omitted).toBe(0);
    expect(preview.sections.at(-1)?.text).toContain('Texto único da seção 84.');
  });
  it('alinha a rolagem proporcional opcional dos painéis na comparação', async () => {
    const before = await readBookPreview('before.epub', await book('<p>Texto antigo.</p>'));
    const after = await readBookPreview('after.epub', await book('<p>Texto atual.</p>'));
    const row = compareBookPreviews(before, after)[0]!;
    const view = comparisonCards(row, 18, true);
    const cards = view.querySelectorAll<HTMLElement>('.optional-reader-card');
    const left = cards[0]!;
    const right = cards[1]!;
    Object.defineProperties(left, {
      scrollHeight: { configurable: true, value: 900 },
      clientHeight: { configurable: true, value: 100 },
    });
    Object.defineProperties(right, {
      scrollHeight: { configurable: true, value: 600 },
      clientHeight: { configurable: true, value: 100 },
    });
    left.scrollTop = 400;
    left.dispatchEvent(new Event('scroll'));
    expect(right.scrollTop).toBe(250);
    const independent = comparisonCards(row, 18, false);
    const other = independent.querySelectorAll<HTMLElement>('.optional-reader-card');
    other[0]!.scrollTop = 150;
    other[0]!.dispatchEvent(new Event('scroll'));
    expect(other[1]!.scrollTop).toBe(0);
  });


});
