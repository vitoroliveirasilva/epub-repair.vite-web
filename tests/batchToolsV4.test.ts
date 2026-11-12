import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { processEpubBatch } from '../src/epub/tools/batchProcessor';

async function blobData(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('Falha de leitura'));
    reader.readAsArrayBuffer(blob);
  });
}

describe('Lotes limitados e isolados', () => {
  it('preserva relatórios por arquivo, não interrompe quando há um arquivo inválido', async () => {
    const bytes = await buildKindleIssueEpub();
    const files = [
      new File([Uint8Array.from(bytes)], 'Livro.epub', { type: 'application/epub+zip' }),
      new File([Uint8Array.from(bytes)], 'livro.EPUB', { type: 'application/epub+zip' }),
      new File(['não é um EPUB'], 'quebrado.epub', { type: 'application/epub+zip' }),
    ];
    const result = await processEpubBatch(files);
    expect(result.entries).toHaveLength(3);
    expect(result.entries[2]?.status).toBe('recusado');
    const exported = result.entries.filter((entry) => entry.output).map((entry) => entry.output!);
    expect(new Set(exported.map((name) => name.toLowerCase())).size).toBe(exported.length);
    const zip = await JSZip.loadAsync(await blobData(result.zip));
    expect(zip.file('resultado-lote.txt')).toBeTruthy();
    const summary = await zip.file('resultado-lote.txt')!.async('string');
    expect(summary).toContain('quebrado.epub');
  });

  it('não aceita lote acima do limite ou cancelado', async () => {
    const files = Array.from({ length: 7 }, (_, index) =>
      new File(['x'], 'livro-' + index + '.epub'));
    await expect(processEpubBatch(files)).rejects.toThrow('até seis');
    const controller = new AbortController();
    controller.abort();
    await expect(processEpubBatch(files.slice(0, 1), controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
  });
});
