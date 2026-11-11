import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildEpubFromPdf } from '../src/converter/buildEpub';
import type { ConverterOptions, PdfAnalysisResult } from '../src/converter/model';

const options: ConverterOptions = {
  profile: 'book',
  outputLayout: 'reflowable',
  language: 'pt-BR',
  enableOcr: true,
  removeRepeatedMargins: true,
  removePageNumbers: true,
  dehyphenate: true,
  normalizeTypography: true,
};

const analysis: PdfAnalysisResult = {
  fileName: 'obra.pdf',
  fileSize: 100,
  pageCount: 1,
  title: 'Obra de teste',
  author: 'Autora',
  pages: [{
    pageNumber: 1,
    width: 600,
    height: 800,
    lines: [],
    text: 'Conteúdo preservado.',
    nativeCharacters: 20,
    usedOcr: false,
    columnCount: 1,
    imageCount: 0,
  }],
  sections: [{
    id: 'section-001',
    title: 'Capítulo 1',
    plainText: 'Conteúdo preservado.',
    html: '<h1>Capítulo 1</h1><p>Conteúdo preservado.</p>',
    sourcePages: [1],
  }],
  warnings: [],
  suggestedLayout: 'reflowable',
  nativeTextPages: 1,
  ocrPages: 0,
  scannedPages: 0,
  repeatedMarginLines: [],
  qualityScore: 100,
};

describe('geração de EPUB pelo conversor', () => {
  it('gera pacote EPUB 3 navegável e sem erros estruturais', async () => {
    const result = await buildEpubFromPdf({
      sourceBytes: new Uint8Array([1, 2, 3]),
      analysis,
      sections: analysis.sections,
      title: 'Obra de teste',
      author: 'Autora',
      options,
    });
    const zip = await JSZip.loadAsync(result.bytes);
    const mimetype = await zip.file('mimetype')?.async('text');
    const opf = await zip.file('OEBPS/content.opf')?.async('text');
    const nav = await zip.file('OEBPS/nav.xhtml')?.async('text');
    const chapter = await zip.file('OEBPS/Text/section-001.xhtml')?.async('text');
    expect(mimetype).toBe('application/epub+zip');
    expect(opf).toContain('properties="nav"');
    expect(nav).toContain('Capítulo 1');
    expect(chapter).toContain('Conteúdo preservado.');
    expect(result.validation.stats.fatalCount).toBe(0);
    expect(result.validation.stats.errorCount).toBe(0);
  });
});
