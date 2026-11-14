import { describe, expect, it } from 'vitest';
import type { BookPreview, BookSection } from '../src/epub/tools/bookTools';
import type { BookBlock } from '../src/epub/tools/bookReader';
import { compareBookPreviews, comparisonSummary } from '../src/epub/tools/bookComparison';

function chapter(text: string, blocks: BookBlock[],
  styleFingerprint = ''): BookSection {
  return { path: 'Text/chapter.xhtml', title: 'Capítulo', text,
    truncated: false, blocks, styleFingerprint };
}

function book(...sections: BookSection[]): BookPreview {
  return { title: 'Exemplo', sections, fixedLayout: false, omitted: 0 };
}

describe('v4 comparação de formatação, estrutura e recursos', () => {
  it('detecta negrito alterado mesmo quando o texto é idêntico', () => {
    const original = chapter('Texto destacado.', [
      { kind: 'paragraph', text: 'Texto destacado.', runs: [
        { text: 'Texto ', marks: [] },
        { text: 'destacado.', marks: ['strong'] },
      ] },
    ]);
    const altered = chapter('Texto destacado.', [
      { kind: 'paragraph', text: 'Texto destacado.', runs: [
        { text: 'Texto destacado.', marks: [] },
      ] },
    ]);
    const [row] = compareBookPreviews(book(original), book(altered));
    expect(row?.status).toBe('format-changed');
    expect(row?.aspects).toEqual(['format']);
    expect(row?.addedWords).toBe(0);
    expect(comparisonSummary([row!])).toContain('1 alterada');
  });

  it('detecta alterações na hierarquia de títulos, sem mudar palavras', () => {
    const original = chapter('Início\n\nTexto.', [
      { kind: 'heading', level: 1, text: 'Início' },
      { kind: 'paragraph', text: 'Texto.' },
    ]);
    const altered = chapter('Início\n\nTexto.', [
      { kind: 'paragraph', text: 'Início' },
      { kind: 'paragraph', text: 'Texto.' },
    ]);
    const [row] = compareBookPreviews(book(original), book(altered));
    expect(row?.status).toBe('structure-changed');
    expect(row?.aspects).toEqual(['structure']);
  });

  it('detecta perda da grade de tabela e da fusão de células', () => {
    const original = chapter('A\n\nB', [
      { kind: 'table', text: '', table: { caption: '', truncated: false,
        rows: [[{ text: 'A', heading: true, colspan: 2, rowspan: 1, runs: [] }],
          [{ text: 'B', heading: false, colspan: 1, rowspan: 1, runs: [] }]] } },
    ]);
    const altered = chapter('A\n\nB', [
      { kind: 'paragraph', text: 'A' }, { kind: 'paragraph', text: 'B' },
    ]);
    const [row] = compareBookPreviews(book(original), book(altered));
    expect(row?.status).toBe('structure-changed');
    expect(row?.aspects).toContain('structure');
  });

  it('diferencia alterações somente em CSS e não declara igualdade visual', () => {
    const original = chapter('Texto idêntico', [
      { kind: 'paragraph', text: 'Texto idêntico' },
    ], 'css-old');
    const altered = chapter('Texto idêntico', [
      { kind: 'paragraph', text: 'Texto idêntico' },
    ], 'css-new');
    const [row] = compareBookPreviews(book(original), book(altered));
    expect(row?.status).toBe('style-changed');
    expect(row?.aspects).toEqual(['styles']);
  });

  it('detecta alteração dos bytes de imagem mesmo mantendo o mesmo caminho', () => {
    const mk = (img: string) => chapter('Uma figura', [
      { kind: 'paragraph', text: 'Uma figura' },
      { kind: 'image', text: 'Ilustração', imagePath: 'OPS/Images/a.png',
        imageDataUrl: img },
    ]);
    const [row] = compareBookPreviews(book(mk('data:image/png;base64,abc')),
      book(mk('data:image/png;base64,xyz')));
    expect(row?.status).toBe('images-changed');
    expect(row?.aspects).toEqual(['images']);
  });

  it('relata múltiplos aspectos afetados, sem esconder formato por mudança textual', () => {
    const original = chapter('Texto antes.', [
      { kind: 'paragraph', text: 'Texto antes.', runs: [
        { text: 'Texto antes.', marks: ['emphasis'] },
      ] },
    ], 'v1');
    const altered = chapter('Texto depois.', [
      { kind: 'paragraph', text: 'Texto depois.', runs: [
        { text: 'Texto depois.', marks: [] },
      ] },
    ], 'v2');
    const [row] = compareBookPreviews(book(original), book(altered));
    expect(row?.status).toBe('text-changed');
    expect(row?.aspects).toEqual(['text', 'format', 'styles']);
    expect(row?.addedWords).toBeGreaterThan(0);
  });

  it('mantém capítulos sem mudança e capítulos adicionados com as contagens corretas', () => {
    const a = chapter('Sem mudanças', [{ kind: 'paragraph', text: 'Sem mudanças' }]);
    const b = { ...a, path: 'Text/new.xhtml', title: 'Novo' };
    const rows = compareBookPreviews(book(a), book(a, b));
    expect(rows.map((row) => row.status)).toEqual(['same', 'added']);
    expect(rows[0]?.aspects).toEqual([]);
    expect(comparisonSummary(rows)).toContain('1 nova(s)');
  });

});
