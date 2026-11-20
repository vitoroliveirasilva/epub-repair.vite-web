import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildEpubFromPdf } from '../src/converter/buildEpub';
import { assertConvertedContentIntegrity } from '../src/converter/contentIntegrity';
import { analyzeReview } from '../src/converter/reviewSuggestions';
import type {
  ConverterOptions, EditableSection, PdfAnalysisResult, PdfPageAnalysis,
} from '../src/converter/model';

const pixel = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABCf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=';
const options: ConverterOptions = {
  profile: 'book', outputLayout: 'reflowable', language: 'pt-BR', enableOcr: false,
  removeRepeatedMargins: false, removePageNumbers: false, dehyphenate: true,
  normalizeTypography: true,
};

function section(html: string, sourcePages = [1]): EditableSection {
  return { id: 'section-001', title: 'Capítulo 1',
    plainText: 'Texto da seção', html, sourcePages };
}

function page(number: number, overrides: Partial<PdfPageAnalysis> = {}): PdfPageAnalysis {
  return { pageNumber: number, width: 612, height: 792, lines: [],
    text: 'Texto da página', nativeCharacters: 16, usedOcr: false,
    columnCount: 1, imageCount: 0, kind: 'text', preserveAsImage: false,
    ...overrides };
}

function analysis(sections: EditableSection[], pages: PdfPageAnalysis[]): PdfAnalysisResult {
  return {
    fileName: 'teste.pdf', fileSize: 100, pageCount: pages.length,
    title: 'Livro de teste', author: 'Autoria',
    metadata: { publisher: '', publicationDate: '', isbn: '',
      translator: '', description: '' },
    pages, sections, warnings: [], suggestedLayout: 'reflowable',
    nativeTextPages: pages.length, ocrPages: 0, scannedPages: 0,
    visualPages: 0, blankPages: 0, repeatedMarginLines: [], qualityScore: 100,
  };
}

async function build(sections: EditableSection[], pages: PdfPageAnalysis[]) {
  return buildEpubFromPdf({
    sourceBytes: new Uint8Array([1, 2, 3]), analysis: analysis(sections, pages),
    sections, title: 'Livro de teste', author: 'Autoria', options,
  });
}

const visual = (): PdfPageAnalysis => page(2, {
  text: 'Texto original reconhecido no PDF.',
  kind: 'visual', preserveAsImage: true, imageCount: 1,
  previewDataUrl: pixel,
});

describe('v4 integridade de conteúdo no EPUB final', () => {
  it('registra as seções textuais realmente preservadas no pacote', async () => {
    const source = section('<h1>Capítulo 1</h1><p>Trecho editorial intacto.</p>');
    const result = await build([source], [page(1)]);
    expect(result.integrity).toEqual({ sectionsChecked: 1, imageReferencesChecked: 0 });
    expect(result.validation.stats.errorCount).toBe(0);
  });

  it('não substitui edição manual de página visual pelo texto original do PDF', async () => {
    const html = '<span id="page-1" class="pagebreak" epub:type="pagebreak" title="1"></span>' +
      '<p>Antes da página visual.</p>' +
      '<span id="page-2" class="pagebreak" epub:type="pagebreak" title="2"></span>' +
      '<p>Versão editada e aprovada pelo usuário.</p>' +
      '<span id="page-3" class="pagebreak" epub:type="pagebreak" title="3"></span>' +
      '<p>Depois da página visual.</p>';
    const source = section(html, [1, 2, 3]);
    const result = await build([source], [page(1), visual(), page(3)]);
    const zip = await JSZip.loadAsync(result.bytes);
    const chapter = await zip.file('OEBPS/Text/section-001.xhtml')!.async('string');
    expect(chapter).toContain('Versão editada e aprovada pelo usuário.');
    expect(chapter).not.toContain('Texto original reconhecido no PDF.');
    expect(chapter.match(/visual-page-0002\.jpg/gu)).toHaveLength(1);
    expect(chapter.indexOf('page-2')).toBeLessThan(chapter.indexOf('visual-page-0002.jpg'));
    expect(chapter.indexOf('visual-page-0002.jpg')).toBeLessThan(chapter.indexOf('Versão editada'));
    expect(chapter.indexOf('Versão editada')).toBeLessThan(chapter.indexOf('page-3'));
    expect(result.integrity?.imageReferencesChecked).toBe(1);
  });

  it('respeita edição pelo campo de texto mesmo quando o editor removeu marcadores', async () => {
    const original = section(
      '<span id="page-2" class="pagebreak" epub:type="pagebreak" title="2"></span>' +
      '<p>Texto original reconhecido no PDF.</p>', [2]);
    const edited = section('<p>Transcrição corrigida manualmente pelo usuário.</p>', [2]);
    const pages = [page(1), visual()];
    const result = await buildEpubFromPdf({
      sourceBytes: new Uint8Array([1, 2, 3]), analysis: analysis([original], pages),
      sections: [edited], title: 'Livro corrigido', author: 'Autoria', options,
    });
    const zip = await JSZip.loadAsync(result.bytes);
    const chapter = await zip.file('OEBPS/Text/section-001.xhtml')!.async('string');
    expect(chapter).toContain('Transcrição corrigida manualmente pelo usuário.');
    expect(chapter).not.toContain('Texto original reconhecido no PDF.');
    expect(chapter).toContain('visual-page-0002.jpg');
    expect(result.integrity?.imageReferencesChecked).toBe(1);
  });

  it('não duplica o texto da página visual quando não há marcador de página', async () => {
    const source = section('<p>Texto original reconhecido no PDF.</p>', [2]);
    const result = await build([source], [page(1), visual()]);
    const zip = await JSZip.loadAsync(result.bytes);
    const chapter = await zip.file('OEBPS/Text/section-001.xhtml')!.async('string');
    expect(chapter.match(/Texto original reconhecido no PDF\./gu)).toHaveLength(1);
    expect(chapter.match(/visual-page-0002\.jpg/gu)).toHaveLength(1);
  });

  it('avisa quando linhas relevantes do PDF quase não aparecem na seção editável', () => {
    const lines = Array.from({ length: 10 }, (_, index) => ({
      text: 'Frase original preservável ' + (index + 1) +
        ' com conteúdo importante para a leitura completa.',
      y: 690 - index * 20, x: 50, width: 480, fontSize: 12, fontName: 'body',
    }));
    const original = page(1, { lines, text: lines.map((line) => line.text).join('\n') });
    const unrelated = section('<p>Texto editorial completamente diferente.</p>');
    unrelated.plainText = 'Texto editorial completamente diferente.';
    const missing = analyzeReview(analysis([unrelated], [original]), [unrelated]);
    expect(missing.some((item) => item.code === 'POSSIBLE_TEXT_LOSS')).toBe(true);
    expect(missing.find((item) => item.code === 'POSSIBLE_TEXT_LOSS')?.priority)
      .toBe('high');

    const complete = section('<p>' + lines.map((line) => line.text).join(' ') + '</p>');
    complete.plainText = lines.map((line) => line.text).join(' ');
    const preserved = analyzeReview(analysis([complete], [original]), [complete]);
    expect(preserved.some((item) => item.code === 'POSSIBLE_TEXT_LOSS')).toBe(false);
  });

  it('não acusa perda quando a página é visual e o texto está na imagem', () => {
    const visualPage = visual();
    visualPage.lines = Array.from({ length: 10 }, (_, index) => ({
      text: 'Texto da página visual ' + index + ' que não precisa ser refluível.',
      y: 700 - index * 20, x: 48, width: 480, fontSize: 12, fontName: 'body',
    }));
    const edited = section('<p>Legenda breve da página.</p>', [2]);
    edited.plainText = 'Legenda breve da página.';
    expect(analyzeReview(analysis([edited], [visualPage]), [edited])
      .some((item) => item.code === 'POSSIBLE_TEXT_LOSS')).toBe(false);
  });

  it('impede disponibilização se a seção perder caracteres na saída', async () => {
    const source = section('<p>Parágrafo que não pode desaparecer.</p>');
    const result = await build([source], [page(1)]);
    const zip = await JSZip.loadAsync(result.bytes);
    const name = 'OEBPS/Text/section-001.xhtml';
    const html = await zip.file(name)!.async('string');
    zip.file(name, html.replace('não pode desaparecer', 'pode desaparecer'));
    const changed = await zip.generateAsync({ type: 'uint8array' });
    await expect(assertConvertedContentIntegrity(changed, [{ ...source, visualPages: [] }]))
      .rejects.toThrow(/texto editado/iu);
  });

  it('recusa pacote com capítulo omitido do spine, mesmo com XHTML presente', async () => {
    const source = section('<h1>Capítulo 1</h1><p>Parágrafo integral do capítulo.</p>');
    const result = await build([source], [page(1)]);
    const zip = await JSZip.loadAsync(result.bytes);
    const path = 'OEBPS/content.opf';
    const opf = await zip.file(path)!.async('string');
    expect(opf).toContain('<itemref idref="section-1"/>');
    zip.file(path, opf.replace('<itemref idref="section-1"/>', ''));
    const changed = await zip.generateAsync({ type: 'uint8array' });
    await expect(assertConvertedContentIntegrity(changed, [{
      ...source, visualPages: [],
    }])).rejects.toThrow(/capítulos no spine/iu);
  });

  it('aceita edição intencional do texto sem compará-la ao PDF original', async () => {
    const first = section('<p>Parágrafo longo antes da revisão editorial.</p>');
    const edited = section('<p>Parágrafo curto após revisão editorial.</p>');
    const result = await buildEpubFromPdf({
      sourceBytes: new Uint8Array([1, 2, 3]),
      analysis: analysis([first], [page(1)]), sections: [edited],
      title: 'Livro corrigido', author: 'Autoria', options,
    });
    expect(result.integrity?.sectionsChecked).toBe(1);
    const zip = await JSZip.loadAsync(result.bytes);
    const text = await zip.file('OEBPS/Text/section-001.xhtml')!.async('string');
    expect(text).toContain('Parágrafo curto após revisão editorial.');
    expect(text).not.toContain('Parágrafo longo antes');
  });

  it('bloqueia uma imagem removida após o acabamento automático', async () => {
    const source = section('<p>Texto que acompanha a imagem.</p>', [1, 2]);
    const result = await build([source], [page(1), visual()]);
    const zip = await JSZip.loadAsync(result.bytes);
    zip.remove('OEBPS/Images/visual-page-0002.jpg');
    const changed = await zip.generateAsync({ type: 'uint8array' });
    await expect(assertConvertedContentIntegrity(changed, [{
      ...source, visualPages: [visual()],
    }])).rejects.toThrow(/imagem|página visual/iu);
  });

  it('rejeita imagem visual com dados inválidos em vez de salvar referência quebrada', async () => {
    const invalid = page(2, { kind: 'visual', preserveAsImage: true, imageCount: 1,
      previewDataUrl: 'data:image/jpeg;base64,!' });
    const source = section('<p>Texto preservado.</p>', [1, 2]);
    await expect(build([source], [page(1), invalid]))
      .rejects.toThrow(/preservar a página visual/iu);
  });

  it('respeita cancelamento durante a auditoria final', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(assertConvertedContentIntegrity(new Uint8Array(), [],
      controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
