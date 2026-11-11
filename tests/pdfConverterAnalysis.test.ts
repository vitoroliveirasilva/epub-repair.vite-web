import { describe, expect, it } from 'vitest';
import { classifyPage, selectPagesForImageTextReading, withTimeout } from '../src/converter/pdfEngine';
import type { PdfPageAnalysis } from '../src/converter/model';

function page(pageNumber: number, kind: PdfPageAnalysis['kind']): PdfPageAnalysis {
  return {
    pageNumber,
    width: 600,
    height: 800,
    lines: [],
    text: '',
    nativeCharacters: kind === 'text' ? 300 : 0,
    usedOcr: false,
    columnCount: 1,
    imageCount: kind === 'text' || kind === 'blank' ? 0 : 1,
    kind,
    preserveAsImage: kind !== 'text' && kind !== 'blank',
  };
}

describe('classificação de páginas do conversor', () => {
  it('separa capa, página textual, digitalização, visual e página vazia', () => {
    expect(classifyPage(1, 0, 1)).toBe('cover');
    expect(classifyPage(8, 420, 0)).toBe('text');
    expect(classifyPage(9, 0, 1)).toBe('scanned');
    expect(classifyPage(10, 45, 1)).toBe('visual');
    expect(classifyPage(11, 0, 0)).toBe('blank');
  });

  it('não envia página curta de capítulo com texto nativo para OCR', () => {
    expect(classifyPage(20, 10, 0)).toBe('text');
  });

  it('não inicializa leitura de imagem por uma página visual isolada no início', () => {
    const pages = [page(1, 'cover'), page(2, 'scanned')];
    for (let index = 3; index <= 80; index += 1) pages.push(page(index, 'text'));
    expect(selectPagesForImageTextReading(pages)).toEqual([]);
  });

  it('lê páginas digitalizadas quando a maior parte do documento depende delas', () => {
    const pages = [page(1, 'cover'), page(2, 'scanned'), page(3, 'scanned'), page(4, 'text')];
    expect(selectPagesForImageTextReading(pages).map((item) => item.pageNumber)).toEqual([2, 3]);
  });

  it('lê uma página digitalizada isolada quando ela aparece no conteúdo principal', () => {
    const pages = [page(1, 'cover')];
    for (let index = 2; index <= 10; index += 1) pages.push(page(index, index === 8 ? 'scanned' : 'text'));
    expect(selectPagesForImageTextReading(pages).map((item) => item.pageNumber)).toEqual([8]);
  });

  it('interrompe imediatamente uma tarefa longa quando o usuário cancela', async () => {
    const controller = new AbortController();
    const pending = new Promise<string>(() => undefined);
    const task = withTimeout(pending, 30_000, 'Tempo excedido', controller.signal);
    controller.abort();
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
  });
});
