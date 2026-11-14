import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { groupItemsIntoLines } from '../src/converter/pdfEngine';
import { reconstructDocument } from '../src/converter/textReconstruction';
import { buildEpubFromPdf } from '../src/converter/buildEpub';
import type {
  ConverterOptions, PdfAnalysisResult, PdfLine, PdfPageAnalysis, PdfTextItem,
} from '../src/converter/model';

const options: ConverterOptions = {
  profile: 'book', outputLayout: 'reflowable', language: 'pt-BR',
  enableOcr: true, removeRepeatedMargins: true, removePageNumbers: true,
  dehyphenate: true, normalizeTypography: true,
};
const pixel = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABCf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=';
const line = (text: string, y: number, x = 60, width = 400, fontSize = 12): PdfLine =>
  ({ text, y, x, width, fontSize, fontName: 'body' });
const page = (pageNumber: number, lines: PdfLine[]): PdfPageAnalysis => ({
  pageNumber, width: 612, height: 800, lines,
  text: lines.map((item) => item.text).join('\n'), nativeCharacters: 300,
  usedOcr: false, columnCount: 1, imageCount: 0, kind: 'text',
  preserveAsImage: false,
});

describe('v4 proteção de conteúdo na conversão PDF', () => {
  it('não une células curtas de colunas distantes só porque têm poucas letras', () => {
    const items: PdfTextItem[] = [
      { text: 'ID', x: 48, y: 720, width: 18, height: 12,
        fontSize: 12, fontName: 'body', hasEol: false },
      { text: '42', x: 350, y: 720, width: 18, height: 12,
        fontSize: 12, fontName: 'body', hasEol: false },
    ];
    expect(groupItemsIntoLines(items).map((value) => value.text)).toEqual(['ID', '42']);
    expect(groupItemsIntoLines([
      { ...items[0]!, text: 'e', width: 8 },
      { ...items[1]!, text: 'Book', x: 56, width: 30 },
    ]).map((value) => value.text)).toEqual(['eBook']);
  });

  it('não remove capítulos numerados confundindo números diferentes com cabeçalho recorrente', () => {
    const pages = Array.from({ length: 5 }, (_, index) => page(index + 1, [
      line('COLEÇÃO DE LEITURA', 788, 200, 205, 10),
      line('CAPÍTULO ' + (index + 1), 749, 220, 180, 21),
      line('Conteúdo único do capítulo ' + (index + 1) + '.', 650),
    ]));
    const original = pages.map((p) => p.lines.map((item) => item.text));
    const result = reconstructDocument(pages, options, 'Livro');
    expect(result.repeatedMarginLines).toContain('COLEÇÃO DE LEITURA');
    const text = result.sections.map((section) => section.plainText).join('\n');
    expect(text).not.toContain('COLEÇÃO DE LEITURA');
    for (let index = 1; index <= 5; index += 1) {
      expect(text).toContain('CAPÍTULO ' + index);
      expect(text).toContain('Conteúdo único do capítulo ' + index);
    }
    expect(pages.map((p) => p.lines.map((item) => item.text))).toEqual(original);
  });

  it('não apaga frase idêntica em margens alternadas se nenhuma delas é recorrente', () => {
    const pages = Array.from({ length: 4 }, (_, index) => page(index + 1, [
      line('Texto relevante na margem', index < 2 ? 780 : 25, 150, 295),
      line('Conteúdo editorial original da página ' + (index + 1) + '.', 490),
    ]));
    const result = reconstructDocument(pages, options, 'Livro');
    expect(result.repeatedMarginLines).toEqual([]);
    expect(result.sections.map((section) => section.plainText).join(' '))
      .toContain('Texto relevante na margem');
  });

  it('preserva figura mesmo quando a única linha é uma numeração removida', () => {
    const illustration = page(2, [line('2', 25, 290, 16, 9)]);
    illustration.imageCount = 1;
    illustration.figures = [{
      id: 'figure-0002-01', pageNumber: 2, x: 110, y: 200,
      width: 380, height: 300, dataUrl: pixel,
    }];
    const result = reconstructDocument([illustration], options, 'Livro');
    expect(result.sections[0]?.html).toContain('../Images/figure-0002-01.jpg');
    expect(result.sections[0]?.html).not.toMatch(/<p>2<\/p>/u);
    expect(result.sections[0]?.plainText).toContain('[[figura:figure-0002-01]]');
  });

  it('inclui figura sem texto no XHTML, no manifest e no arquivo final', async () => {
    const illustration = page(2, [line('2', 25, 290, 16, 9)]);
    illustration.imageCount = 1;
    illustration.figures = [{
      id: 'figure-0002-01', pageNumber: 2, x: 110, y: 200,
      width: 380, height: 300, dataUrl: pixel,
    }];
    const reconstructed = reconstructDocument([illustration], options, 'Livro');
    const analysis: PdfAnalysisResult = {
      fileName: 'livro.pdf', fileSize: 100, pageCount: 1, title: 'Livro',
      author: 'Autora', metadata: { publisher: '', publicationDate: '', isbn: '',
        translator: '', description: '' },
      pages: [illustration], sections: reconstructed.sections,
      warnings: reconstructed.warnings, suggestedLayout: 'reflowable',
      nativeTextPages: 1, ocrPages: 0, scannedPages: 0,
      visualPages: 0, blankPages: 0, repeatedMarginLines: [], qualityScore: 100,
    };
    const converted = await buildEpubFromPdf({
      sourceBytes: new Uint8Array([1, 2, 3]), analysis,
      sections: reconstructed.sections, title: analysis.title,
      author: analysis.author, options,
    });
    const zip = await JSZip.loadAsync(converted.bytes);
    const html = await zip.file('OEBPS/Text/section-001.xhtml')?.async('string');
    const opf = await zip.file('OEBPS/content.opf')?.async('string');
    expect(html).toContain('src="../Images/figure-0002-01.jpg"');
    expect(opf).toContain('href="Images/figure-0002-01.jpg"');
    expect(zip.file('OEBPS/Images/figure-0002-01.jpg')).not.toBeNull();
    expect(converted.validation.stats.errorCount).toBe(0);
    expect(converted.validation.stats.fatalCount).toBe(0);
  });
});
