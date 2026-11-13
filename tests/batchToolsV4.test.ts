import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { processEpubBatch, MAX_BATCH_FILES, MAX_BATCH_BYTES,
  type BatchFileProgress } from '../src/epub/tools/batchProcessor';

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
    expect(stages).toContain('completed');
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
});
