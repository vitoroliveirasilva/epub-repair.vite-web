import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { processEpubBatch, MAX_BATCH_FILES, MAX_BATCH_BYTES,
  type BatchFileProgress } from '../src/epub/tools/batchProcessor';
import { addBatchSelection } from '../src/epub/tools/batchSelection';
import { renderUploader } from '../src/ui/components/Uploader';
import { openBatchWithFiles, renderOptionalEpubTools } from '../src/ui/optionalEpubTools';
import { createInitialState } from '../src/app/state';

async function blobData(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('Falha de leitura'));
    reader.readAsArrayBuffer(blob);
  });
}

function epub(bytes: Uint8Array, name: string): File {
  return new File([Uint8Array.from(bytes)], name, { type: 'application/epub+zip' });
}

describe('Lotes limitados e isolados', () => {
  it('mantém resultados por arquivo, inclusive recusados, com relatórios JSON independentes', async () => {
    const bytes = await buildKindleIssueEpub();
    const files = [
      epub(bytes, 'Livro.epub'),
      epub(bytes, 'livro.EPUB'),
      epub(new TextEncoder().encode('não é um EPUB'), 'quebrado.epub'),
      epub(bytes, 'nao-epub.pdf'),
    ];
    const progress: Array<BatchFileProgress & { completed: number }> = [];
    const result = await processEpubBatch(files, undefined,
      (_phase, completed, _total, detail) => {
        if (detail) progress.push({ ...detail, completed });
      });
    expect(result.entries).toHaveLength(4);
    expect(result.entries[2]?.status).toBe('recusado');
    expect(result.entries[3]?.status).toBe('recusado');
    const exported = result.entries.filter((entry) => entry.output).map((entry) => entry.output!);
    expect(new Set(exported.map((name) => name.toLowerCase())).size).toBe(exported.length);
    const zip = await JSZip.loadAsync(await blobData(result.zip));
    expect(zip.file('resultado-lote.txt')).toBeTruthy();
    const summary = JSON.parse(await zip.file('resultado-lote.json')!.async('string')) as {
      total: number; counts: { exported: number; rejected: number };
      entries: Array<{ report: string; status: string }>;
    };
    expect(summary.total).toBe(4);
    expect(summary.counts.exported).toBe(exported.length);
    expect(summary.counts.rejected).toBe(2);
    expect(summary.entries).toHaveLength(4);
    for (const [index, entry] of result.entries.entries()) {
      expect(entry.report).toBe('relatorios/arquivo-0' + (index + 1) + '.json');
      const json = JSON.parse(await zip.file(entry.report)!.async('string')) as {
        status: string; original: { summary?: object | null }; final: { summary?: object | null };
      };
      expect(json.status).toBe(entry.status);
      if (entry.output) {
        expect(zip.file(entry.output)).toBeTruthy();
        expect(json.final.summary).not.toBeNull();
      } else {
        expect(zip.file(entry.source)).toBeNull();
      }
    }
    expect(progress.filter((p) => p.stage === 'completed' || p.stage === 'failed'))
      .toHaveLength(4);
    expect(progress.filter((p) => p.stage === 'completed' || p.stage === 'failed')
      .map((p) => p.completed)).toEqual([1, 2, 3, 4]);
    expect(progress.some((p) => p.stage === 'validating')).toBe(true);
  });

  it('garante que relatórios recusados identifiquem problemas e sem vazamento de resultados', async () => {
    const files = [new File([], 'vazio.epub'), new File(['abc'], 'normal.txt')];
    const result = await processEpubBatch(files);
    expect(result.entries.map((entry) => entry.status)).toEqual(['recusado', 'recusado']);
    expect(result.entries.every((entry) => !entry.output)).toBe(true);
    const zip = await JSZip.loadAsync(await blobData(result.zip));
    expect(zip.file(/\.epub$/iu)).toHaveLength(0);
    expect(zip.file(/\.json$/iu)).toHaveLength(3);
  });

  it('não aceita lote acima do limite ou cancelado antes de iniciar', async () => {
    const files = Array.from({ length: MAX_BATCH_FILES + 1 }, (_, index) =>
      new File(['x'], 'livro-' + index + '.epub'));
    await expect(processEpubBatch(files)).rejects.toThrow('até seis');
    const oversized = { name: 'maior.epub', size: MAX_BATCH_BYTES + 1 } as File;
    await expect(processEpubBatch([oversized])).rejects.toThrow('80 MB');
    const controller = new AbortController();
    controller.abort();
    await expect(processEpubBatch(files.slice(0, 1), controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
  });

  it('interrompe durante o lote sem criar ZIP parcial', async () => {
    const bytes = await buildKindleIssueEpub();
    const controller = new AbortController();
    const stages: string[] = [];
    await expect(processEpubBatch([epub(bytes, 'primeiro.epub'),
      epub(bytes, 'segundo.epub')], controller.signal,
    (_phase, _completed, _total, detail) => {
      if (!detail) return;
      stages.push(detail.stage);
      if (detail.index === 1 && detail.stage === 'reading') controller.abort();
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(stages.some((stage) => stage === 'completed' || stage === 'failed'))
      .toBe(true);
    expect(stages.filter((stage) => stage === 'reading')).toHaveLength(2);
  });

  it('inclui o relatório de cada resultado mesmo quando o EPUB requer revisão manual', async () => {
    const bytes = await buildKindleIssueEpub();
    const result = await processEpubBatch([epub(bytes, 'manual.epub')]);
    const zip = await JSZip.loadAsync(await blobData(result.zip));
    const entry = result.entries[0]!;
    expect(entry.report).toMatch(/relatorios\/arquivo-01\.json/u);
    const detail = JSON.parse(await zip.file(entry.report)!.async('string')) as {
      source: string; original: { issues: Array<{ code: string }> };
      final: { issues: Array<{ code: string }> };
    };
    expect(detail.source).toBe('manual.epub');
    expect(Array.isArray(detail.original.issues)).toBe(true);
    expect(Array.isArray(detail.final.issues)).toBe(true);
  });
  it('analisa um ou vários arquivos sem reparar quando o usuário escolhe somente verificar', async () => {
    const bytes = await buildKindleIssueEpub();
    const result = await processEpubBatch([
      epub(bytes, 'um.epub'), epub(bytes, 'dois.epub'),
    ], undefined, undefined, { mode: 'validate' });
    expect(result.mode).toBe('validate');
    expect(result.entries).toHaveLength(2);
    expect(result.entries.every((entry) => !entry.changed && !entry.output)).toBe(true);
    expect(result.entries.every((entry) => entry.repairsApplied === 0 &&
      entry.optimizationsApplied === 0)).toBe(true);
    const zip = await JSZip.loadAsync(await blobData(result.zip));
    expect(zip.file(/\.epub$/iu)).toHaveLength(0);
    const summary = JSON.parse(await zip.file('resultado-lote.json')!.async('string')) as {
      mode: string; counts: { changed: number; exported: number };
    };
    expect(summary.mode).toBe('validate');
    expect(summary.counts.changed).toBe(0);
    expect(summary.counts.exported).toBe(0);
    expect(zip.file('relatorios/arquivo-01.json')).not.toBeNull();
    expect(zip.file('relatorios/arquivo-02.json')).not.toBeNull();
  });

  it('corrige de verdade TODOS os EPUBs elegíveis, com conteúdo alterado e ações documentadas', async () => {
    const bytes = await buildKindleIssueEpub();
    const stages: string[] = [];
    const result = await processEpubBatch([
      epub(bytes, 'livro-a.epub'), epub(bytes, 'livro-b.epub'),
    ], undefined, (_phase, _n, _total, detail) => {
      if (detail) stages.push(detail.stage);
    }, { mode: 'repair', includeOptimizations: true });
    expect(result.mode).toBe('repair');
    expect(result.entries).toHaveLength(2);
    expect(result.entries.every((entry) => entry.changed && Boolean(entry.output)),
      JSON.stringify(result.entries)).toBe(true);
    expect(result.entries.every((entry) => entry.repairsApplied > 0)).toBe(true);
    expect(stages.filter((stage) => stage === 'repairing')).toHaveLength(2);
    const zip = await JSZip.loadAsync(await blobData(result.zip));
    const summary = JSON.parse(await zip.file('resultado-lote.json')!.async('string')) as {
      counts: { changed: number; repaired: number; exported: number };
    };
    expect(summary.counts.changed).toBe(2);
    expect(summary.counts.repaired).toBe(2);
    expect(summary.counts.exported).toBe(2);
    for (const [index, entry] of result.entries.entries()) {
      const revisedBytes = await zip.file(entry.output!)!.async('uint8array');
      expect(Array.from(revisedBytes)).not.toEqual(Array.from(bytes));
      const report = JSON.parse(await zip.file(entry.report)!.async('string')) as {
        changed: boolean;
        repairsApplied: number;
        repairActions: Array<{ type: string; title: string; detail: string }>;
        final: { summary: { fatal: number } };
      };
      expect(report.changed).toBe(true);
      expect(report.repairsApplied).toBeGreaterThan(0);
      expect(report.repairActions.length).toBeGreaterThan(0);
      expect(report.final.summary.fatal).toBe(0);
      expect(entry.source).toBe('livro-' + (index ? 'b' : 'a') + '.epub');
    }
  });

  it('isola EPUB quebrado e mantém o arquivo efetivamente corrigido no ZIP', async () => {
    const bytes = await buildKindleIssueEpub();
    const result = await processEpubBatch([
      epub(bytes, 'corrigivel.epub'),
      epub(new TextEncoder().encode('não é um zip'), 'quebrado.epub'),
    ], undefined, undefined, { mode: 'repair' });
    expect(result.entries[0]?.changed, JSON.stringify(result.entries)).toBe(true);
    expect(result.entries[0]?.output).toBeTruthy();
    expect(result.entries[1]?.output).toBeUndefined();
    expect(['recusado', 'falhou']).toContain(result.entries[1]?.status);
    const zip = await JSZip.loadAsync(await blobData(result.zip));
    expect(zip.file(result.entries[0]!.output!)).toBeTruthy();
    expect(zip.file(result.entries[1]!.report)).toBeTruthy();
  });

  it('aceita um EPUB e adiciona outros por seleções sucessivas preservando o limite', () => {
    const first = new File(['a'], 'primeiro.epub', { lastModified: 10 });
    const second = new File(['b'], 'segundo.epub', { lastModified: 20 });
    const selected = addBatchSelection([], [first]);
    expect(selected.files).toHaveLength(1);
    const more = addBatchSelection(selected.files, [first, second,
      new File(['x'], 'texto.txt')]);
    expect(more.files.map((file) => file.name))
      .toEqual(['primeiro.epub', 'segundo.epub']);
    expect(more.added).toBe(1);
    expect(more.ignored).toBe(1);
    const overflow = addBatchSelection(more.files, Array.from({ length: 5 },
      (_, index) => new File(['x'], 'book-' + index + '.epub')));
    expect(overflow.error).toMatch(/até|permite/iu);
    expect(overflow.files).toEqual(more.files);
  });

  it('o upload principal aceita um ou vários EPUBs por escolha e por arrasto', () => {
    const state = createInitialState();
    const one = new File(['a'], 'um.epub');
    const two = new File(['b'], 'dois.epub');
    const singles: string[] = [];
    const multiples: string[][] = [];
    const view = renderUploader(state,
      (file) => singles.push(file.name),
      (files) => multiples.push(files.map((file) => file.name)));
    const input = view.querySelector<HTMLInputElement>('#epub-file-input')!;
    expect(input.multiple).toBe(true);
    Object.defineProperty(input, 'files', { configurable: true, value: [one] });
    input.dispatchEvent(new Event('change'));
    expect(singles).toEqual(['um.epub']);
    Object.defineProperty(input, 'files', { configurable: true, value: [one, two] });
    input.dispatchEvent(new Event('change'));
    expect(multiples).toEqual([['um.epub', 'dois.epub']]);
    const zone = view.querySelector<HTMLElement>('.dropzone')!;
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [two, one] } });
    zone.dispatchEvent(drop);
    expect(multiples[1]).toEqual(['dois.epub', 'um.epub']);
  });

  it('abre o lote automaticamente, aceita arrastar mais um e alterna modos explicitamente', () => {
    const state = createInitialState();
    const one = new File(['a'], 'um.epub');
    const two = new File(['b'], 'dois.epub');
    const host = document.createElement('div');
    const rerender = (): void => {
      host.replaceChildren(renderOptionalEpubTools(state, rerender, () => {}));
    };
    openBatchWithFiles(state, [one]);
    rerender();
    expect((host.querySelector('.optional-tools') as HTMLDetailsElement).open).toBe(true);
    expect(host.textContent).toContain('1 EPUB(s) selecionado(s)');
    expect(host.querySelector<HTMLInputElement>('input[value="repair"]')?.checked).toBe(true);
    const dropZone = host.querySelector<HTMLElement>('.optional-batch-dropzone')!;
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [two] } });
    dropZone.dispatchEvent(drop);
    expect(host.textContent).toContain('2 EPUB(s) selecionado(s)');
    const radios = host.querySelectorAll<HTMLInputElement>('input[name="optional-batch-mode"]');
    expect(radios).toHaveLength(2);
    const validate = host.querySelector<HTMLInputElement>('input[value="validate"]')!;
    validate.checked = true;
    validate.dispatchEvent(new Event('change'));
    expect(host.textContent).toContain('Verificar EPUB(s)');
    expect(host.querySelector<HTMLInputElement>('input[value="validate"]')?.checked).toBe(true);
    const remove = Array.from(host.querySelectorAll<HTMLButtonElement>(
      '.optional-batch-files button')).find((button) => button.textContent === 'Remover');
    remove?.click();
    expect(host.textContent).toContain('1 EPUB(s) selecionado(s)');
  });

});
