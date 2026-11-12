import JSZip from 'jszip';
import { canRepairReport, DEFAULT_REPAIR_OPTIONS } from '../index';
import { repairEpub } from '../repair/repairEpub';
import { inspectEpub } from '../validation/validateEpub';

export interface BatchEntry {
  source: string;
  output?: string | undefined;
  status: 'validado' | 'reparado' | 'revisão manual' | 'recusado' | 'falhou';
  detail: string;
}

export interface BatchResult {
  zip: Blob;
  entries: BatchEntry[];
}

const MAX_BATCH_FILES = 6;
const MAX_BATCH_BYTES = 80 * 1024 * 1024;

function checkCanceled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Processamento em lote cancelado.', 'AbortError');
}

function safeName(value: string): string {
  const base = value.replace(/[\\/\u0000-\u001f\u007f:*?"<>|]/gu, '_')
    .replace(/^\.+/u, '_').replace(/[. ]+$/u, '').slice(0, 120).trim();
  return base && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(base)
    ? base : 'arquivo.epub';
}

function uniqueName(candidate: string, taken: Set<string>): string {
  const normalized = safeName(candidate).replace(/\.epub$/iu, '') || 'arquivo';
  let result = normalized + '.epub';
  let index = 2;
  while (taken.has(result.toLowerCase())) {
    result = normalized + '-(' + index++ + ').epub';
  }
  taken.add(result.toLowerCase());
  return result;
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler o EPUB.'));
    reader.readAsArrayBuffer(blob);
  });
}

export async function processEpubBatch(
  files: readonly File[], signal?: AbortSignal,
  onProgress?: (phase: string, completed: number, total: number) => void,
): Promise<BatchResult> {
  if (files.length < 1 || files.length > MAX_BATCH_FILES ||
    files.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_BYTES) {
    throw new Error('Selecione até seis EPUBs com no máximo 80 MB somados.');
  }
  const entries: BatchEntry[] = [];
  const used = new Set<string>();
  const zip = new JSZip();
  for (const [index, file] of files.entries()) {
    checkCanceled(signal);
    onProgress?.('Lote: ' + (index + 1) + '/' + files.length + ' · ' + file.name,
      index, files.length);
    const source = safeName(file.name);
    try {
      if (!file.name.toLowerCase().endsWith('.epub')) {
        entries.push({ source, status: 'recusado', detail: 'Extensão inválida' });
        continue;
      }
      const bytes = await blobBytes(file);
      checkCanceled(signal);
      const report = await inspectEpub(file.name, bytes);
      if (!report.validZip || report.stats.fatalCount > 0) {
        entries.push({ source, status: 'recusado', detail: 'EPUB inválido ou com erro fatal' });
        continue;
      }
      let resultBytes = bytes;
      let resultName = file.name;
      let status: BatchEntry['status'] = 'validado';
      let finalReport = report;
      if (canRepairReport(report)) {
        const repaired = await repairEpub(file.name, bytes, DEFAULT_REPAIR_OPTIONS,
          'repair', undefined, signal);
        checkCanceled(signal);
        if (repaired.changed && repaired.blob) {
          resultBytes = await blobBytes(repaired.blob);
          resultName = repaired.fileName;
          status = 'reparado';
          finalReport = repaired.after;
        } else {
          status = 'revisão manual';
        }
      }
      checkCanceled(signal);
      const archiveName = uniqueName(resultName, used);
      zip.file(archiveName, resultBytes);
      entries.push({ source, output: archiveName, status,
        detail: finalReport.stats.errorCount + ' erro(s), ' +
          finalReport.stats.warningCount + ' aviso(s) no relatório final' });
    } catch (error) {
      checkCanceled(signal);
      entries.push({ source, status: 'falhou', detail: error instanceof Error
        ? error.message.slice(0, 240) : 'Falha não identificada' });
    }
    onProgress?.('Arquivo concluído: ' + (index + 1) + '/' + files.length,
      index + 1, files.length);
  }
  checkCanceled(signal);
  const summary = [
    'EPUB Repair — resultado de processamento em lote',
    '',
    ...entries.map((entry) =>
      [entry.source, entry.status, entry.output ?? '-', entry.detail].join(' | ')),
  ].join('\n');
  zip.file('resultado-lote.txt', summary);
  onProgress?.('Compactando resultados do lote', files.length, files.length);
  const output = await zip.generateAsync({
    type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 },
  });
  checkCanceled(signal);
  return { zip: output, entries };
}
