import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { locateEmbeddedImageRegions } from '../src/converter/imageExtraction';
import { reconstructDocument } from '../src/converter/textReconstruction';
import { buildEpubFromPdf } from '../src/converter/buildEpub';
import type { ConverterOptions, PdfAnalysisResult, PdfPageAnalysis } from '../src/converter/model';

const options: ConverterOptions = {
  profile: 'book', outputLayout: 'reflowable', language: 'pt-BR', enableOcr: true,
  removeRepeatedMargins: true, removePageNumbers: true, dehyphenate: true,
  normalizeTypography: true,
};
const pixel = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABCf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=';

describe('imagens incorporadas no PDF', () => {
  it('encontra ilustração por transformação de desenho e descarta ícone minúsculo', () => {
    const regions = locateEmbeddedImageRegions(
      [1, 3, 4, 2, 1, 3, 4, 2],
      [[], [457.6, 0, 0, 356.3, 77.2, 233.2], ['large'], [],
        [], [10, 0, 0, 12, 0, 0], ['icon'], []],
      { save: 1, restore: 2, transform: 3, paintImageXObject: 4 },
      { width: 612, height: 792, transform: [1, 0, 0, -1, 0, 792] },
    );
    expect(regions).toHaveLength(1);
    expect(regions[0]?.x).toBeCloseTo(77.2, 1);
    expect(regions[0]?.y).toBeCloseTo(202.5, 1);
  });


  it('inclui figuras compactas legíveis, mas não recupera ícones muito pequenos', () => {
    const regions = locateEmbeddedImageRegions(
      [1, 3, 4, 2, 1, 3, 4, 2, 1, 3, 4, 2],
      [[], [122, 0, 0, 22, 98, 310], ['figura manuscrita'], [],
        [], [84, 0, 0, 21, 451, 436], ['logo'], [],
        [], [12, 0, 0, 12, 200, 120], ['ícone'], []],
      { save: 1, restore: 2, transform: 3, paintImageXObject: 4 },
      { width: 612, height: 792, transform: [1, 0, 0, -1, 0, 792] },
    );
    expect(regions).toHaveLength(2);
    expect(regions.map((region) => Math.round(region.width)).sort((a, b) => a - b)).toEqual([84, 122]);
  });

  it('insere figura entre dois trechos e inclui a imagem no manifest do EPUB', async () => {
    const page: PdfPageAnalysis = {
      pageNumber: 1, width: 612, height: 792, nativeCharacters: 48,
      lines: [
        { text: 'Antes da ilustração.', x: 72, y: 720, width: 180, fontSize: 12, fontName: 'body' },
        { text: 'Depois da ilustração.', x: 72, y: 160, width: 190, fontSize: 12, fontName: 'body' },
      ],
      text: 'Antes da ilustração.\nDepois da ilustração.', usedOcr: false, columnCount: 1,
      imageCount: 1, kind: 'text', preserveAsImage: false,
      figures: [{ id: 'figure-0001-01', pageNumber: 1, x: 80, y: 190,
        width: 400, height: 280, dataUrl: pixel }],
    };
    const reconstructed = reconstructDocument([page], options, 'Livro teste');
    const section = reconstructed.sections[0]!;
    expect(section.html.indexOf('Antes da')).toBeLessThan(section.html.indexOf('figure-0001-01.jpg'));
    expect(section.html.indexOf('figure-0001-01.jpg')).toBeLessThan(section.html.indexOf('Depois da'));
    expect(section.plainText).toContain('[[figura:figure-0001-01]]');
    const analysis: PdfAnalysisResult = {
      fileName: 'livro.pdf', fileSize: 100, pageCount: 1,
      title: 'Livro teste', author: 'Autora',
      metadata: { publisher: '', publicationDate: '', isbn: '9786599025730', translator: '', description: '' },
      pages: [page], sections: reconstructed.sections, warnings: [], suggestedLayout: 'reflowable',
      nativeTextPages: 1, ocrPages: 0, scannedPages: 0, visualPages: 0,
      blankPages: 0, repeatedMarginLines: [], qualityScore: 100,
    };
    const converted = await buildEpubFromPdf({
      sourceBytes: new Uint8Array([1, 2, 3]), analysis,
      sections: reconstructed.sections, title: analysis.title, author: analysis.author, options,
    });
    const zip = await JSZip.loadAsync(converted.bytes);
    expect(zip.file('OEBPS/Images/figure-0001-01.jpg')).not.toBeNull();
    expect(await zip.file('OEBPS/content.opf')!.async('string')).toContain('href="Images/figure-0001-01.jpg"');
    expect(await zip.file('OEBPS/content.opf')!.async('string')).toContain('urn:isbn:9786599025730');
    expect(await zip.file('OEBPS/Text/section-001.xhtml')!.async('string')).toContain('src="../Images/figure-0001-01.jpg"');
    expect(converted.validation.stats.errorCount).toBe(0);
    expect(converted.validation.stats.fatalCount).toBe(0);
  });
});
