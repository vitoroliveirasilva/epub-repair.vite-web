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
  metadata: {
    publisher: 'Editora de teste',
    publicationDate: '2026',
    isbn: '9788501000002',
    translator: 'Tradutora de teste',
    description: 'Descrição editorial de teste.',
  },
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
    kind: 'text',
    preserveAsImage: false,
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
  visualPages: 0,
  blankPages: 0,
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
    const css = await zip.file('OEBPS/Styles/book.css')?.async('text');
    expect(mimetype).toBe('application/epub+zip');
    expect(opf).toContain('properties="nav"');
    expect(opf).toContain('urn:isbn:9788501000002');
    expect(opf).toContain('<dc:publisher>Editora de teste</dc:publisher>');
    expect(opf).toContain('marc:relators">trl</meta>');
    expect(css).not.toContain('background: #fff');
    expect(nav).toContain('Capítulo 1');
    expect(chapter).toContain('Conteúdo preservado.');
    expect(result.validation.stats.fatalCount).toBe(0);
    expect(result.validation.stats.errorCount).toBe(0);
  });

  it('mantém páginas visuais na posição original sem poluir o sumário', async () => {
    const pixel = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABCf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=';
    const visualAnalysis: PdfAnalysisResult = {
      ...analysis,
      pageCount: 3,
      pages: [
        { ...analysis.pages[0]!, pageNumber: 1, text: 'Antes da atividade.' },
        {
          pageNumber: 2,
          width: 600,
          height: 800,
          lines: [],
          text: 'Formulário da atividade',
          nativeCharacters: 21,
          usedOcr: false,
          columnCount: 1,
          imageCount: 1,
          kind: 'visual',
          preserveAsImage: true,
          previewDataUrl: pixel,
        },
        { ...analysis.pages[0]!, pageNumber: 3, text: 'Depois da atividade.' },
      ],
      sections: [{
        id: 'section-001',
        title: 'Capítulo 1',
        plainText: 'Antes da atividade.\n\nFormulário da atividade\n\nDepois da atividade.',
        html: '<span id="page-1" class="pagebreak" epub:type="pagebreak" title="1"></span><p>Antes da atividade.</p><span id="page-2" class="pagebreak" epub:type="pagebreak" title="2"></span><p>Formulário da atividade</p><span id="page-3" class="pagebreak" epub:type="pagebreak" title="3"></span><p>Depois da atividade.</p>',
        sourcePages: [1, 2, 3],
      }],
      visualPages: 1,
    };
    const result = await buildEpubFromPdf({
      sourceBytes: new Uint8Array([1, 2, 3]),
      analysis: visualAnalysis,
      sections: visualAnalysis.sections,
      title: visualAnalysis.title,
      author: visualAnalysis.author,
      options,
    });
    const zip = await JSZip.loadAsync(result.bytes);
    const nav = await zip.file('OEBPS/nav.xhtml')!.async('text');
    const chapter = await zip.file('OEBPS/Text/section-001.xhtml')!.async('text');
    expect(nav).not.toContain('Página visual 2');
    expect(chapter.indexOf('page-2')).toBeLessThan(chapter.indexOf('visual-page-0002.jpg'));
    expect(chapter.indexOf('visual-page-0002.jpg')).toBeLessThan(chapter.indexOf('page-3'));
    expect(chapter.match(/Formulário da atividade/gu)).toHaveLength(1);
  });
});
