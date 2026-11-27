import { describe, expect, it } from 'vitest';
import { detectColumnCount, reconstructDocument } from '../src/converter/textReconstruction';
import { groupItemsIntoLines } from '../src/converter/pdfEngine';
import { analyzeReview } from '../src/converter/reviewSuggestions';
import type { ConverterOptions, PdfPageAnalysis, PdfTextItem, PdfLine, PdfAnalysisResult } from '../src/converter/model';

const options: ConverterOptions = {
  profile: 'book', outputLayout: 'reflowable', language: 'pt-BR', enableOcr: true,
  removeRepeatedMargins: false, removePageNumbers: false, dehyphenate: true,
  normalizeTypography: true,
};
const line = (text: string, x: number, y: number, width = 220, fontSize = 12): PdfLine =>
  ({ text, x, y, width, fontSize, fontName: 'body' });
const page = (lines: PdfLine[], figures: PdfPageAnalysis['figures'] = []): PdfPageAnalysis => ({
  pageNumber: 4, width: 612, height: 792, lines, text: lines.map((entry) => entry.text).join('\n'),
  nativeCharacters: 350, usedOcr: false, columnCount: 2, imageCount: figures?.length ?? 0,
  kind: 'text', preserveAsImage: false, ...(figures?.length ? { figures } : {}),
});

describe('Fidelidade de colunas no conversor PDF', () => {
  it('separa dois blocos lado a lado, mesmo com linhas na mesma altura', () => {
    const items: PdfTextItem[] = Array.from({ length: 12 }, (_, index) => {
      const y = 730 - index * 18;
      return [
        { text: 'Texto da coluna esquerda número ' + (index + 1),
          x: 48, y, width: 210, height: 12, fontSize: 12, fontName: 'body', hasEol: false },
        { text: 'Texto da coluna direita número ' + (index + 1),
          x: 345, y, width: 210, height: 12, fontSize: 12, fontName: 'body', hasEol: false },
      ];
    }).flat();
    const lines = groupItemsIntoLines(items);
    expect(lines).toHaveLength(24);
    expect(lines.every((item) => !item.text.includes('esquerda número 1 Texto da coluna direita'))).toBe(true);
    expect(detectColumnCount(lines, 612)).toBe(2);
    const reconstructed = reconstructDocument([page(lines)], options, 'Livro em colunas');
    const content = reconstructed.sections.map((section) => section.plainText).join('\n');
    expect(content.indexOf('esquerda número 12')).toBeLessThan(content.indexOf('direita número 1'));
    const html = reconstructed.sections.map((section) => section.html).join('\n');
    expect(html.match(/<p>/gu)?.length).toBeGreaterThanOrEqual(2);
    expect(content).toContain('direita número 12');
  });

  it('mantém um título largo entre duas faixas de leitura em duas colunas', () => {
    const source = page([
      line('Esquerda superior primeira frase.', 50, 730),
      line('Esquerda superior segunda frase.', 50, 705),
      line('Direita superior primeira frase.', 340, 730),
      line('Direita superior segunda frase.', 340, 705),
      line('PARTE II', 40, 635, 530, 23),
      line('Esquerda inferior primeira frase.', 50, 555),
      line('Direita inferior primeira frase.', 340, 555),
    ]);
    const result = reconstructDocument([source], options, 'Livro em faixas');
    const fullText = result.sections.map((section) => section.plainText).join('\n');
    const top = fullText.indexOf('Direita superior segunda');
    const heading = fullText.indexOf('PARTE II');
    const bottom = fullText.indexOf('Esquerda inferior');
    expect(top).toBeGreaterThan(-1);
    expect(heading).toBeGreaterThan(top);
    expect(bottom).toBeGreaterThan(heading);
    expect(fullText.indexOf('Direita inferior')).toBeGreaterThan(bottom);
    expect(result.sections.some((section) => section.title === 'PARTE II')).toBe(true);
  });

  it('insere ilustração da coluna direita na posição correta, sem duplicar imagem', () => {
    const source = page([
      line('Conteúdo da coluna esquerda inicia.', 46, 725),
      line('Conteúdo da coluna esquerda termina.', 46, 410),
      line('Trecho direito antes da figura.', 335, 720),
      line('Trecho direito depois da figura.', 335, 390),
    ], [{ id: 'figure-0004-01', pageNumber: 4, x: 345, y: 195,
      width: 180, height: 125, dataUrl: 'data:image/jpeg;base64,/9j/' }]);
    const result = reconstructDocument([source], options, 'Livro ilustrado');
    const html = result.sections.map((section) => section.html).join('\n');
    const left = html.indexOf('Conteúdo da coluna esquerda termina.');
    const upper = html.indexOf('Trecho direito antes da figura.');
    const image = html.indexOf('../Images/figure-0004-01.jpg');
    const lower = html.indexOf('Trecho direito depois da figura.');
    expect(left).toBeGreaterThan(0);
    expect(upper).toBeGreaterThan(left);
    expect(image).toBeGreaterThan(upper);
    expect(lower).toBeGreaterThan(image);
    expect(html.match(/figure-0004-01.jpg/gu)).toHaveLength(1);
    expect(html).toContain('page-4');
  });

  it('avisa sobre grade tabular sem confundir texto comum de duas colunas', () => {
    const tableLines = Array.from({ length: 4 }, (_, row) =>
      [50, 245, 440].map((x, column) =>
        line(`Célula da linha ${row + 1} coluna ${column + 1}`, x, 700 - row * 28, 120)));
    const table = { ...page(tableLines.flat()), columnCount: 1 };
    const structured = { pages: [table], repeatedMarginLines: [] } as unknown as PdfAnalysisResult;
    const tableWarning = analyzeReview(structured, []);
    expect(tableWarning.some((finding) => finding.code === 'TABLE_LAYOUT')).toBe(true);
    expect(tableWarning.find((finding) => finding.code === 'TABLE_LAYOUT')?.priority)
      .toBe('medium');

    const columns = page(Array.from({ length: 9 }, (_, row) => [
      line(`Parágrafo esquerdo da página número ${row + 1}`, 50, 710 - row * 19),
      line(`Parágrafo direito da página número ${row + 1}`, 340, 710 - row * 19),
    ]).flat());
    const book = { pages: [columns], repeatedMarginLines: [] } as unknown as PdfAnalysisResult;
    expect(analyzeReview(book, []).some((finding) => finding.code === 'TABLE_LAYOUT')).toBe(false);
  });

  it('preserva a ordem básica de linhas em PDFs de uma coluna', () => {
    const source = { ...page([
      line('Primeira linha de texto.', 50, 700),
      line('Segunda linha de texto.', 50, 675),
    ]), columnCount: 1 };
    const result = reconstructDocument([source], options, 'Livro simples');
    expect(result.sections[0]?.plainText.indexOf('Primeira')).toBeLessThan(
      result.sections[0]?.plainText.indexOf('Segunda') ?? -1);
  });
});
