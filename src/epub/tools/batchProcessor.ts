import JSZip from 'jszip';
import { canRepairReport, DEFAULT_REPAIR_OPTIONS } from '../index';
import type { ValidationReport } from '../model/epubTypes';
import { repairEpub } from '../repair/repairEpub';
import { inspectEpub } from '../validation/validateEpub';

export interface BatchEntry {
  source: string;
  output?: string | undefined;
  report: string;
  status: 'validado' | 'reparado' | 'revisão manual' | 'recusado' | 'falhou';
  detail: string;
}

export interface BatchResult {
  zip: Blob;
  entries: BatchEntry[];
}

export type BatchStage = 'reading' | 'validating' | 'repairing' |
  'packing' | 'completed' | 'failed';

export interface BatchFileProgress {
  index: number;
  source: string;
  stage: BatchStage;
  status?: BatchEntry['status'] | undefined;
  detail: string;
}

export const MAX_BATCH_FILES = 6;
export const MAX_BATCH_BYTES = 80 * 1024 * 1024;
const REPORT_LIMIT = 120;
const PACKAGE_LIMIT = 160 * 1024 * 1024;

function checkCanceled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Processamento em lote cancelado.', 'AbortError');
}

function safeName(value: string): string {
  const clean = Array.from(value).map((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 || /[\\/:*?"<>|]/u.test(character)
      ? '_' : character;
  }).join('');
  const base = clean.replace(/^\.+/u, '_').replace(/[. ]+$/u, '')
    .slice(0, 120).trim();
  return base && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(base)
    ? base : 'arquivo.epub';
}

function uniqueName(candidate: string, taken: Set<string>): string {
  const normalized = safeName(candidate).replace(/\.epub$/iu, '') || 'arquivo';
  let result = normalized + '.epub';
  let index = 2;
  while (taken.has(result.toLowerCase())) {
    result = normalized.slice(0, 112) + '-(' + index++ + ').epub';
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

function issueDetails(report?: ValidationReport): object {
  if (!report) return { summary: null, issues: [] };
  return {
    summary: {
      fatal: report.stats.fatalCount,
      errors: report.stats.errorCount,
      warnings: report.stats.warningCount,
      info: report.stats.infoCount,
      kindleScore: report.stats.kindleScore,
    },
    issues: report.issues.slice(0, REPORT_LIMIT).map((issue) => ({
      code: issue.code, severity: issue.severity, title: issue.title,
      detail: issue.detail.slice(0, 400),
      ...(issue.file ? { file: issue.file } : {}),
    })),
    ...(report.issues.length > REPORT_LIMIT
      ? { omittedIssues: report.issues.length - REPORT_LIMIT } : {}),
  };
}

function progress(
  emit: ((phase: string, completed: number, total: number,
    detail?: BatchFileProgress) => void) | undefined,
  event: BatchFileProgress, completed: number, total: number,
): void {
  emit?.('Lote ' + completed + '/' + total + ' · ' + event.source + ': ' +
    event.detail, completed, total, event);
}

export async function processEpubBatch(
  files: readonly File[], signal?: AbortSignal,
  onProgress?: (phase: string, completed: number, total: number,
    detail?: BatchFileProgress) => void,
): Promise<BatchResult> {
  checkCanceled(signal);
  if (files.length < 1 || files.length > MAX_BATCH_FILES ||
    files.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_BYTES) {
    throw new Error('Selecione até seis EPUBs com no máximo 80 MB somados.');
  }
  const entries: BatchEntry[] = [];
  const used = new Set<string>();
  const zip = new JSZip();
  let accumulated = 0;
  for (const [index, file] of files.entries()) {
    checkCanceled(signal);
    const source = safeName(file.name);
    let status: BatchEntry['status'] = 'falhou';
    let detail: string;
    let output: string | undefined;
    let initial: ValidationReport | undefined;
    let final: ValidationReport | undefined;
    let warnings: string[] = [];
    let actions: string[] = [];
    const notify = (stage: BatchStage, message: string): void => {
      checkCanceled(signal);
      progress(onProgress, { index, source, stage, detail: message,
        ...(stage === 'completed' || stage === 'failed' ? { status } : {}) },
      index + (stage === 'completed' || stage === 'failed' ? 1 : 0), files.length);
    };
    notify('reading', 'Lendo arquivo');
    try {
      if (!/\.epub$/iu.test(file.name) || file.size < 1) {
        status = 'recusado';
        detail = 'Arquivo vazio ou com extensão diferente de EPUB.';
      } else {
        const bytes = await blobBytes(file);
        checkCanceled(signal);
        notify('validating', 'Verificando estrutura EPUB');
        initial = await inspectEpub(file.name, bytes, signal);
        checkCanceled(signal);
        final = initial;
        if (!initial.validZip || initial.stats.fatalCount > 0) {
          status = 'recusado';
          detail = 'Arquivo inválido ou com problema fatal; não foi incluído no ZIP.';
        } else {
          let resultBytes = bytes;
          let resultName = file.name;
          status = 'validado';
          if (canRepairReport(initial)) {
            notify('repairing', 'Aplicando reparos conservadores');
            const repaired = await repairEpub(file.name, bytes,
              DEFAULT_REPAIR_OPTIONS, 'repair', undefined, signal);
            checkCanceled(signal);
            final = repaired.after;
            warnings = repaired.warnings;
            actions = repaired.actions.map((action) => action.title);
            if (repaired.changed && repaired.blob) {
              resultBytes = await blobBytes(repaired.blob);
              resultName = repaired.fileName;
              status = 'reparado';
            } else {
              status = 'revisão manual';
            }
          }
          if (!final.validZip || final.stats.fatalCount > 0) {
            status = 'recusado';
            detail = 'A verificação final detectou um problema fatal. Resultado não exportado.';
          } else if (resultBytes.length + accumulated > PACKAGE_LIMIT) {
            status = 'recusado';
            detail = 'Limite de memória do lote excedido. Resultado não exportado.';
          } else {
            notify('packing', 'Adicionando EPUB verificado ao ZIP');
            const hasUnresolved = final.stats.errorCount > 0 ||
              final.stats.warningCount > 0 || warnings.length > 0;
            if (hasUnresolved) status = 'revisão manual';
            output = uniqueName(resultName, used);
            zip.file(output, resultBytes);
            accumulated += resultBytes.length;
            detail = final.stats.errorCount + ' erro(s), ' +
              final.stats.warningCount + ' aviso(s) após a verificação.';
            if (hasUnresolved) detail += ' Confira o relatório individual.';
          }
        }
      }
    } catch (error) {
      checkCanceled(signal);
      status = 'falhou';
      detail = error instanceof Error ? error.message.slice(0, 240)
        : 'Falha não identificada.';
    }
    checkCanceled(signal);
    const report = 'relatorios/arquivo-' + String(index + 1).padStart(2, '0') + '.json';
    zip.file(report, JSON.stringify({
      source, status, ...(output ? { output } : {}), detail,
      original: issueDetails(initial),
      final: issueDetails(final),
      repairActions: actions.slice(0, REPORT_LIMIT),
      repairWarnings: warnings.slice(0, REPORT_LIMIT),
    }, null, 2));
    entries.push({ source, status, detail, report, ...(output ? { output } : {}) });
    notify(status === 'falhou' || status === 'recusado' ? 'failed' : 'completed',
      status + '. ' + detail);
  }
  checkCanceled(signal);
  const summary = [
    'EPUB Repair - resultado do processamento local em lote',
    'Total: ' + entries.length,
    '',
    ...entries.map((entry) => [
      entry.source, entry.status, entry.output ?? '-', entry.report, entry.detail,
    ].join(' | ')),
  ].join('\n');
  zip.file('resultado-lote.txt', summary);
  zip.file('resultado-lote.json', JSON.stringify({
    total: entries.length,
    counts: {
      exported: entries.filter((entry) => entry.output).length,
      validated: entries.filter((entry) => entry.status === 'validado').length,
      repaired: entries.filter((entry) => entry.status === 'reparado').length,
      manual: entries.filter((entry) => entry.status === 'revisão manual').length,
      rejected: entries.filter((entry) => entry.status === 'recusado').length,
      failed: entries.filter((entry) => entry.status === 'falhou').length,
    },
    entries,
  }, null, 2));
  progress(onProgress, { index: files.length - 1, source: 'ZIP final',
    stage: 'packing', detail: 'Compactando resultados e relatórios' },
  files.length, files.length);
  const output = await zip.generateAsync({
    type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 },
  }, () => checkCanceled(signal));
  checkCanceled(signal);
  return { zip: output, entries };
}
