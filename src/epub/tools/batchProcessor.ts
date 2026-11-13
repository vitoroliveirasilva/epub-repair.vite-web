import JSZip from 'jszip';
import { canOptimizeReport, canRepairReport, DEFAULT_REPAIR_OPTIONS } from '../index';
import type { ValidationReport } from '../model/epubTypes';
import type { RepairAction } from '../model/repairTypes';
import { repairEpub } from '../repair/repairEpub';
import { inspectEpub } from '../validation/validateEpub';

export type BatchMode = 'validate' | 'repair';

export interface BatchOptions {
  mode: BatchMode;
  includeOptimizations?: boolean | undefined;
}

export interface BatchEntry {
  source: string;
  output?: string | undefined;
  report: string;
  status: 'validado' | 'reparado' | 'otimizado' | 'sem alterações' |
    'revisão manual' | 'recusado' | 'falhou';
  detail: string;
  mode: BatchMode;
  changed: boolean;
  repairsApplied: number;
  optimizationsApplied: number;
}

export interface BatchResult {
  zip: Blob;
  entries: BatchEntry[];
  mode: BatchMode;
}

export type BatchStage = 'reading' | 'validating' | 'repairing' |
  'optimizing' | 'packing' | 'completed' | 'failed';

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

function actionDetails(actions: RepairAction[]): object[] {
  return actions.slice(0, REPORT_LIMIT).map((action) => ({
    type: action.type, title: action.title, detail: action.detail,
    ...(action.file ? { file: action.file } : {}),
  }));
}

function appliedCount(actions: RepairAction[]): number {
  return actions.filter((action) => action.type !== 'skipped').length;
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
  options: BatchOptions = { mode: 'repair', includeOptimizations: true },
): Promise<BatchResult> {
  checkCanceled(signal);
  if (options.mode !== 'repair' && options.mode !== 'validate') {
    throw new Error('Modo de processamento em lote inválido.');
  }
  if (files.length < 1 || files.length > MAX_BATCH_FILES ||
    files.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_BYTES) {
    throw new Error('Selecione até seis EPUBs com no máximo 80 MB somados.');
  }
  const entries: BatchEntry[] = [];
  const used = new Set<string>();
  const zip = new JSZip();
  const performRepair = options.mode === 'repair';
  const includeOptimizations = performRepair && options.includeOptimizations !== false;
  let accumulated = 0;
  for (const [index, file] of files.entries()) {
    checkCanceled(signal);
    const source = safeName(file.name);
    let status: BatchEntry['status'] = 'falhou';
    let detail: string;
    let output: string | undefined;
    let changed = false;
    let repairsApplied = 0;
    let optimizationsApplied = 0;
    let initial: ValidationReport | undefined;
    let final: ValidationReport | undefined;
    const repairActions: RepairAction[] = [];
    const optimizationActions: RepairAction[] = [];
    const warnings: string[] = [];
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
        notify('validating', 'Verificando estrutura e possibilidades de melhoria');
        initial = await inspectEpub(file.name, bytes, signal);
        checkCanceled(signal);
        final = initial;
        if (!initial.validZip || initial.stats.fatalCount > 0) {
          status = 'recusado';
          detail = 'EPUB inválido ou com problema fatal. Nenhuma alteração foi aplicada.';
        } else if (!performRepair) {
          const pending = initial.stats.errorCount > 0 || initial.stats.warningCount > 0;
          status = pending ? 'revisão manual' : 'validado';
          detail = 'Somente análise, sem alterações. ' +
            initial.stats.errorCount + ' erro(s) e ' +
            initial.stats.warningCount + ' aviso(s) identificados.';
        } else {
          let resultBytes = bytes;
          let resultName = file.name;
          if (canRepairReport(final, DEFAULT_REPAIR_OPTIONS)) {
            notify('repairing', 'Corrigindo estrutura, conteúdo e navegação');
            const result = await repairEpub(resultName, resultBytes,
              DEFAULT_REPAIR_OPTIONS, 'repair', undefined, signal);
            checkCanceled(signal);
            final = result.after;
            repairActions.push(...result.actions);
            repairsApplied += appliedCount(result.actions);
            if (result.changed && result.blob) {
              resultBytes = await blobBytes(result.blob);
              resultName = result.fileName;
              changed = true;
            }
            warnings.push(...result.warnings.filter((warning) =>
              !warning.startsWith('Nenhuma correção obrigatória')));
          }
          checkCanceled(signal);
          if (includeOptimizations && canOptimizeReport(final)) {
            notify('optimizing', 'Aplicando melhorias opcionais de compatibilidade');
            try {
              const result = await repairEpub(resultName, resultBytes,
                DEFAULT_REPAIR_OPTIONS, 'optimization', undefined, signal);
              checkCanceled(signal);
              final = result.after;
              optimizationActions.push(...result.actions);
              optimizationsApplied += appliedCount(result.actions);
              if (result.changed && result.blob) {
                resultBytes = await blobBytes(result.blob);
                resultName = result.fileName;
                changed = true;
              }
              warnings.push(...result.warnings.filter((warning) =>
                !warning.startsWith('Nenhuma otimização opcional')));
            } catch (error) {
              checkCanceled(signal);
              warnings.push('Otimização opcional não aplicada: ' +
                (error instanceof Error ? error.message.slice(0, 200)
                  : 'Falha não identificada.'));
            }
          }
          checkCanceled(signal);
          if (!final.validZip || final.stats.fatalCount > 0) {
            status = 'recusado';
            detail = 'A validação final encontrou um problema fatal; nenhum EPUB exportado.';
          } else if (resultBytes.length + accumulated > PACKAGE_LIMIT) {
            status = 'recusado';
            detail = 'Limite de memória do lote excedido. Arquivo não exportado.';
          } else {
            notify('packing', 'Incluindo resultado no ZIP');
            const pending = final.stats.errorCount > 0 ||
              final.stats.warningCount > 0 || warnings.length > 0;
            status = pending ? 'revisão manual' : repairsApplied > 0 ? 'reparado'
              : optimizationsApplied > 0 ? 'otimizado' : 'sem alterações';
            output = uniqueName(resultName, used);
            zip.file(output, resultBytes);
            accumulated += resultBytes.length;
            const applied = repairsApplied + optimizationsApplied;
            detail = applied > 0 ? applied + ' melhoria(s) realmente aplicada(s).'
              : 'Nenhuma melhoria automática necessária ou disponível.';
            detail += ' Restaram ' + final.stats.errorCount + ' erro(s) e ' +
              final.stats.warningCount + ' aviso(s).';
            if (pending) detail += ' Ainda exige conferência manual.';
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
      source, mode: options.mode, status, changed, repairsApplied, optimizationsApplied,
      ...(output ? { output } : {}), detail,
      original: issueDetails(initial),
      final: issueDetails(final),
      repairActions: actionDetails(repairActions),
      optimizationActions: actionDetails(optimizationActions),
      repairWarnings: warnings.slice(0, REPORT_LIMIT),
    }, null, 2));
    entries.push({ source, mode: options.mode, status, changed,
      repairsApplied, optimizationsApplied, detail, report,
      ...(output ? { output } : {}) });
    notify(status === 'falhou' || status === 'recusado' ? 'failed' : 'completed',
      status + '. ' + detail);
  }
  checkCanceled(signal);
  const summary = [
    'EPUB Repair - resultado do processamento local em lote',
    'Modo: ' + (performRepair ? 'Corrigir e melhorar todos' : 'Somente verificar'),
    'Total: ' + entries.length,
    '',
    ...entries.map((entry) => [
      entry.source, entry.status, entry.changed ? 'alterado' : 'sem alteração',
      entry.output ?? '-', entry.report, entry.detail,
    ].join(' | ')),
  ].join('\n');
  zip.file('resultado-lote.txt', summary);
  zip.file('resultado-lote.json', JSON.stringify({
    mode: options.mode,
    total: entries.length,
    counts: {
      exported: entries.filter((entry) => entry.output).length,
      changed: entries.filter((entry) => entry.changed).length,
      validated: entries.filter((entry) => entry.status === 'validado').length,
      repaired: entries.filter((entry) => entry.repairsApplied > 0).length,
      optimized: entries.filter((entry) => entry.optimizationsApplied > 0).length,
      unchanged: entries.filter((entry) => entry.status === 'sem alterações').length,
      manual: entries.filter((entry) => entry.status === 'revisão manual').length,
      rejected: entries.filter((entry) => entry.status === 'recusado').length,
      failed: entries.filter((entry) => entry.status === 'falhou').length,
    },
    entries,
  }, null, 2));
  progress(onProgress, { index: files.length - 1, source: 'ZIP final',
    stage: 'packing', detail: 'Compactando livros e relatórios' },
  files.length, files.length);
  const zipBlob = await zip.generateAsync({
    type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 },
  }, () => checkCanceled(signal));
  checkCanceled(signal);
  return { zip: zipBlob, entries, mode: options.mode };
}
