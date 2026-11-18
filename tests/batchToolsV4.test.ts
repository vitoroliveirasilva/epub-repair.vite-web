import JSZip from 'jszip';
import { Blob as NodeBlob } from 'node:buffer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { processEpubBatch, MAX_BATCH_FILES, MAX_BATCH_BYTES,
  type BatchFileProgress } from '../src/epub/tools/batchProcessor';
import { addBatchSelection } from '../src/epub/tools/batchSelection';
import { renderUploader } from '../src/ui/components/Uploader';
import {
  isBatchWorkspaceActive, openBatchWithFiles, renderBatchWorkspace,
  setBatchWorkspaceActive,
} from '../src/ui/optionalEpubTools';
import { createInitialState, type ProcessingProgress } from '../src/app/state';

vi.setConfig({ testTimeout: 30_000 });
beforeAll(() => vi.stubGlobal('Blob', NodeBlob));
afterAll(() => vi.unstubAllGlobals());

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
      }, { mode: 'validate' });
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
    }, { mode: 'validate' })).rejects.toMatchObject({ name: 'AbortError' });
    expect(stages.some((stage) => stage === 'completed' || stage === 'failed'))
      .toBe(true);
    expect(stages.filter((stage) => stage === 'reading')).toHaveLength(2);
  });

  it('inclui o relatório de cada resultado mesmo quando o EPUB requer revisão manual', async () => {
    const bytes = await buildKindleIssueEpub();
    const result = await processEpubBatch([epub(bytes, 'manual.epub')],
      undefined, undefined, { mode: 'validate' });
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
    ], undefined, undefined, { mode: 'repair', includeOptimizations: false });
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

  it('abre os vários EPUBs na área principal e mantém a lista ao alternar o modo', () => {
    const state = createInitialState();
    const one = new File(['a'], 'um.epub');
    const two = new File(['b'], 'dois.epub');
    const host = document.createElement('div');
    const rerender = (): void => {
      host.replaceChildren(renderBatchWorkspace(state, rerender, () => {}, () => {}));
    };
    openBatchWithFiles(state, [one]);
    rerender();
    expect(isBatchWorkspaceActive(state)).toBe(true);
    expect(host.querySelector('.batch-workspace')).not.toBeNull();
    expect(host.textContent).toContain('1 EPUB selecionado');
    expect(host.querySelector<HTMLInputElement>('input[value="repair"]')?.checked).toBe(true);
    const dropZone = host.querySelector<HTMLElement>('.batch-workspace-upload')!;
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [two] } });
    dropZone.dispatchEvent(drop);
    expect(host.textContent).toContain('2 EPUBs selecionados');
    expect(host.textContent).toContain('Corrigir 2 EPUBs');
    expect(host.querySelectorAll('.batch-workspace-files li')).toHaveLength(2);
    const radios = host.querySelectorAll<HTMLInputElement>('input[name="optional-batch-mode"]');
    expect(radios).toHaveLength(2);
    const validate = host.querySelector<HTMLInputElement>('input[value="validate"]')!;
    validate.checked = true;
    validate.dispatchEvent(new Event('change'));
    expect(host.textContent).toContain('Verificar 2 EPUBs');
    expect(host.querySelector<HTMLInputElement>('input[value="validate"]')?.checked).toBe(true);
    const remove = host.querySelector<HTMLButtonElement>(
      '.batch-workspace-files button[aria-label="Remover um.epub do lote"]');
    remove?.click();
    expect(host.textContent).toContain('1 EPUB selecionado');
    setBatchWorkspaceActive(state, false);
    expect(isBatchWorkspaceActive(state)).toBe(false);
    setBatchWorkspaceActive(state, true);
    rerender();
    expect(host.textContent).toContain('1 EPUB selecionado');
  });

  it('mostra alertas claros para seleção inválida e mantém os livros aceitos', () => {
    const state = createInitialState();
    const one = new File(['a'], 'um.epub');
    const host = document.createElement('div');
    const rerender = (): void => {
      host.replaceChildren(renderBatchWorkspace(state, rerender, () => {}, () => {}));
    };
    openBatchWithFiles(state, [one]);
    openBatchWithFiles(state, [new File(['b'], 'imagem.png')]);
    rerender();
    expect(host.textContent).toContain('1 EPUB selecionado');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Nenhum EPUB válido');
    const tooMany = Array.from({ length: MAX_BATCH_FILES }, (_, i) =>
      new File(['x'], 'outro-' + i + '.epub'));
    openBatchWithFiles(state, tooMany);
    rerender();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('6 EPUBs');
    expect(host.querySelectorAll('.batch-workspace-files li')).toHaveLength(1);
  });

  it('concentra os resultados na lista, sem repetir blocos e sem expandir o card a cada arquivo', async () => {
    const state = createInitialState();
    const files = [
      new File(['não é um ZIP'], 'quebrado-a.epub'),
      new File(['não é um ZIP'], 'quebrado-b.epub'),
    ];
    const pending: Array<(ctx: {
      signal: AbortSignal;
      onProgress: (progress: ProcessingProgress) => void;
    }) => Promise<void>> = [];
    const host = document.createElement('div');
    const rerender = (): void => {
      host.replaceChildren(renderBatchWorkspace(state, rerender,
        (_label, task) => { pending.push(task); }, () => {}));
    };
    openBatchWithFiles(state, files);
    rerender();
    expect(host.querySelector('.batch-studio-layout')).not.toBeNull();
    expect(host.querySelector('.batch-studio-library')).not.toBeNull();
    expect(host.querySelector('.batch-studio-console')).not.toBeNull();
    expect(host.querySelector('.batch-studio-file-scroll')).not.toBeNull();
    expect(host.querySelectorAll('.batch-workspace-files li')).toHaveLength(2);
    expect(host.querySelector('.optional-batch-progress')).toBeNull();

    const start = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((item) => item.textContent === 'Corrigir 2 EPUBs');
    start?.click();
    expect(pending).toHaveLength(1);
    await pending[0]!({ signal: new AbortController().signal, onProgress: () => {} });
    rerender();

    expect(host.querySelectorAll('.batch-workspace-files li')).toHaveLength(2);
    expect(host.querySelectorAll('.batch-studio-result-detail')).toHaveLength(2);
    expect((host.querySelector('.batch-studio-result-detail') as HTMLDetailsElement).open).toBe(false);
    expect(host.querySelectorAll('.optional-batch-progress')).toHaveLength(0);
    expect(host.querySelector('.batch-studio-ready')).not.toBeNull();
    expect(host.textContent).toContain('Baixar EPUBs e relatórios');
    expect(host.querySelector('.batch-studio-zip-action .batch-studio-download-icon svg'))
      .not.toBeNull();
    const details = host.querySelector<HTMLDetailsElement>('.batch-studio-result-detail')!;
    details.open = true;
    expect(details.textContent).toContain('Relatório:');
  });

  it('renderiza o estúdio vazio sem revelar o seletor nativo e com operações acessíveis', () => {
    const state = createInitialState();
    const panel = renderBatchWorkspace(state, () => {}, () => {}, () => {});
    expect(panel.querySelector('#batch-workspace-title')?.textContent)
      .toBe('Vários livros. Um só fluxo.');
    expect(panel.querySelector('.batch-studio-title-accent')?.textContent)
      .toBe('Um só fluxo.');
    const input = panel.querySelector<HTMLInputElement>('#batch-epub-input');
    const dropzone = panel.querySelector('.batch-studio-upload');
    expect(input?.classList.contains('visually-hidden')).toBe(true);
    expect(dropzone?.contains(input ?? null)).toBe(false);
    expect(dropzone?.getAttribute('for')).toBe('batch-epub-input');
    expect(panel.querySelector('.batch-studio-empty-mark[aria-hidden="true"]')).not.toBeNull();
    expect(panel.querySelectorAll('.batch-studio-choice-icon svg')).toHaveLength(2);
    expect(panel.querySelectorAll('input[name="optional-batch-mode"]')).toHaveLength(2);
    expect(panel.querySelector<HTMLButtonElement>('.batch-studio-primary')?.disabled)
      .toBe(true);
    expect(panel.querySelector('.batch-studio-file-heading')?.textContent)
      .toContain('0 EPUBs selecionados');
  });

  it('mantém o passo a passo de lote sincronizado com a seleção de arquivos', () => {
    const state = createInitialState();
    const host = document.createElement('div');
    const rerender = (): void => {
      host.replaceChildren(renderBatchWorkspace(state, rerender, () => {}, () => {}));
    };
    rerender();
    let steps = Array.from(host.querySelectorAll('.batch-studio-flow-step'));
    expect(steps).toHaveLength(3);
    expect(steps[0]?.getAttribute('aria-current')).toBe('step');
    expect(steps[1]?.classList.contains('batch-studio-flow-waiting')).toBe(true);
    expect(host.querySelector('.batch-studio-counter-meter')?.children).toHaveLength(6);
    expect(host.querySelectorAll('.batch-studio-counter-tick-filled')).toHaveLength(0);
    expect(host.querySelector('.batch-studio-upload-icon svg path')).not.toBeNull();
    expect(host.querySelector('#batch-workspace')?.getAttribute('data-batch-state'))
      .toBe('empty');
    openBatchWithFiles(state, [new File(['epub'], 'um.epub')]);
    rerender();
    steps = Array.from(host.querySelectorAll('.batch-studio-flow-step'));
    expect(steps[0]?.classList.contains('batch-studio-flow-complete')).toBe(true);
    expect(steps[1]?.getAttribute('aria-current')).toBe('step');
    expect(host.querySelectorAll('.batch-studio-counter-tick-filled')).toHaveLength(1);
    expect(host.querySelector('#batch-workspace')?.getAttribute('data-batch-state'))
      .toBe('selected');
  });

  it('tem lista e opções responsivas sem dependência da seção de ferramentas extras', () => {
    const state = createInitialState();
    const host = document.createElement('div');
    const rerender = (): void => {
      host.replaceChildren(renderBatchWorkspace(state, rerender, () => {}, () => {}));
    };
    openBatchWithFiles(state, [new File(['a'], 'meu-livro.epub')]);
    rerender();
    expect(host.querySelector('.optional-tools')).toBeNull();
    expect(host.querySelector('.batch-studio-file-scroll[role="region"]')).not.toBeNull();
    expect(host.querySelector('.batch-studio-primary')).not.toBeNull();
    expect(host.querySelector('.batch-studio-counter')?.getAttribute('aria-label'))
      .toContain('1 de 6');
    expect(host.querySelector('.batch-studio-file-meta strong')?.getAttribute('title'))
      .toBe('meu-livro.epub');
  });


});
