import { describe, expect, it } from 'vitest';
import { detectColumnCount, reconstructDocument } from '../src/converter/textReconstruction';
import type { ConverterOptions, PdfLine, PdfPageAnalysis } from '../src/converter/model';

const options: ConverterOptions = {
  profile: 'book',
  outputLayout: 'auto',
  language: 'pt-BR',
  enableOcr: true,
  removeRepeatedMargins: true,
  removePageNumbers: true,
  dehyphenate: true,
  normalizeTypography: true,
};

function line(text: string, y: number, x = 60, width = 480, fontSize = 12): PdfLine {
  return { text, x, y, width, fontSize, fontName: 'serif' };
}

function page(pageNumber: number, lines: PdfLine[]): PdfPageAnalysis {
  return {
    pageNumber,
    width: 600,
    height: 800,
    lines,
    text: lines.map((item) => item.text).join('\n'),
    nativeCharacters: 200,
    usedOcr: false,
    columnCount: 1,
    imageCount: 0,
    kind: 'text',
    preserveAsImage: false,
  };
}

describe('reconstrução editorial de PDF', () => {
  it('remove cabeçalho, paginação e hifenização física sem apagar conteúdo', () => {
    const pages = Array.from({ length: 4 }, (_, index) => page(index + 1, [
      line('EDIÇÃO DE LEITURA', 760, 170, 260, 10),
      line(index === 0 ? 'CAPÍTULO 1' : 'Trecho contínuo', 690, 180, 240, index === 0 ? 22 : 12),
      line('A reconstru-', 640),
      line('ção conserva o texto da obra.', 620),
      line(String(index + 1), 32, 295, 10, 9),
    ]));
    const result = reconstructDocument(pages, options, 'Livro');
    const content = result.sections.map((section) => section.plainText).join('\n');
    expect(result.repeatedMarginLines).toContain('EDIÇÃO DE LEITURA');
    expect(content).not.toContain('EDIÇÃO DE LEITURA');
    expect(content).not.toMatch(/^\d$/mu);
    expect(content).toContain('A reconstrução conserva o texto da obra.');
  });

  it('cria seções independentes para capítulos explícitos', () => {
    const result = reconstructDocument([
      page(1, [line('CAPÍTULO 1', 700, 200, 200, 24), line('Primeiro texto.', 650)]),
      page(2, [line('CAPÍTULO 2', 700, 200, 200, 24), line('Segundo texto.', 650)]),
    ], options, 'Livro');
    expect(result.sections).toHaveLength(2);
    expect(result.sections.map((section) => section.title)).toEqual(['CAPÍTULO 1', 'CAPÍTULO 2']);
    expect(result.sections[1]?.sourcePages).toEqual([2]);
  });

  it('detecta duas colunas somente quando há massa textual nos dois lados', () => {
    const columns = Array.from({ length: 6 }, (_, index) => [
      line(`Texto esquerdo suficientemente longo ${index}`, 700 - index * 30, 40, 240),
      line(`Texto direito suficientemente longo ${index}`, 700 - index * 30, 330, 230),
    ]).flat();
    expect(detectColumnCount(columns, 600)).toBe(2);
    expect(detectColumnCount(columns.slice(0, 4), 600)).toBe(1);
  });

  it('reconstrói frase e hifenização que atravessam a troca de página', () => {
    const result = reconstructDocument([
      page(1, [line('A investigação continua de forma surpreen-', 80)]),
      page(2, [line('dente quando a porta se abre.', 700)]),
    ], options, 'Livro');
    expect(result.sections[0]?.plainText).toContain(
      'A investigação continua de forma surpreendente quando a porta se abre.',
    );
    expect(result.sections[0]?.sourcePages).toEqual([1, 2]);
  });

  it('reconstrói parágrafos iniciados por recuo editorial menor que uma linha de texto', () => {
    const result = reconstructDocument([
      page(1, [
        line('CAPÍTULO 1', 720, 210, 180, 22),
        line('O primeiro parágrafo começa recuado e termina aqui.', 670, 77, 430, 15),
        line('Esta linha ainda pertence ao primeiro parágrafo.', 648, 60, 447, 15),
        line('O segundo parágrafo também começa recuado.', 616, 77, 430, 15),
        line('E continua normalmente nesta linha.', 594, 60, 447, 15),
        line('O terceiro parágrafo encerra a amostra.', 562, 77, 430, 15),
      ]),
    ], options, 'Livro');
    const paragraphs = result.sections[0]?.html.match(/<p>/gu) ?? [];
    expect(paragraphs).toHaveLength(3);
    expect(result.sections[0]?.plainText).toContain(
      'O primeiro parágrafo começa recuado e termina aqui. Esta linha ainda pertence ao primeiro parágrafo.',
    );
  });

  it('separa agradecimentos do epílogo como seção editorial própria', () => {
    const result = reconstructDocument([
      page(1, [line('EPÍLOGO', 700, 230, 140, 22), line('O desfecho termina aqui.', 650)]),
      page(2, [line('AGRADECIMENTOS', 700, 190, 220, 20), line('A autora agradece aos leitores.', 650)]),
    ], options, 'Livro');
    expect(result.sections.map((section) => section.title)).toEqual(['EPÍLOGO', 'AGRADECIMENTOS']);
    expect(result.sections[1]?.plainText).not.toContain('O desfecho termina aqui.');
  });

  it('separa e nomeia a dedicatória antes da primeira parte', () => {
    const result = reconstructDocument([
      page(1, [line('Copyright 2026. Todos os direitos reservados.', 650)]),
      page(2, [line('À minha família, com carinho.', 650)]),
      page(3, [line('PARTE I', 700, 230, 140, 22), line('O livro começa aqui.', 650)]),
    ], options, 'Livro');
    expect(result.sections.map((section) => section.title)).toEqual([
      'Créditos editoriais', 'Dedicatória', 'PARTE I',
    ]);
    expect(result.sections[1]?.plainText).toBe('À minha família, com carinho.');
  });
});
