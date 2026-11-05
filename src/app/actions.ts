import {
  canOptimizeReport,
  canRepairReport,
  hasOptionalOptimizations,
  hasManualReviewIssues,
  MAX_FILE_SIZE_BYTES,
  readCoverImageFile,
  repairEpub,
  replaceEpubCover,
} from '../epub';
import type { AppState, ProcessingProgress } from './state';
import { loadEpubInWorker, throwIfProcessingAborted } from './zipWorkerClient';
import { inspectLoadedEpub } from '../epub/validation/validateEpub';

export interface ProcessingContext {
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: ProcessingProgress) => void) | undefined;
}

function publishProgress(context: ProcessingContext, phase: string,
  completed?: number, total?: number): void {
  context.onProgress?.({ phase,
    ...(completed !== undefined ? { completed } : {}),
    ...(total !== undefined ? { total } : {}),
  });
}

async function loadZipForTask(
  state: AppState,
  context: ProcessingContext,
) {
  if (!state.payload) throw new Error('Envie um EPUB antes de processar.');
  publishProgress(context, 'Descompactando EPUB no Worker...');
  const loaded = await loadEpubInWorker(state.payload.file.name, state.payload.bytes, {
    signal: context.signal,
    onProgress: ({ completed, total }) => {
      publishProgress(context, 'Descompactando entradas do EPUB...', completed, total);
    },
  });
  throwIfProcessingAborted(context.signal);
  return loaded;
}


export async function loadFileIntoState(file: File, state: AppState, signal?: AbortSignal): Promise<void> {
  state.error = undefined;
  state.message = undefined;
  state.repairResult = undefined;
  state.report = undefined;
  state.coverImage = undefined;
  state.originalSource = undefined;
  state.lastRepairOptions = undefined;
  state.payload = undefined;

  if (!file.name.toLowerCase().endsWith('.epub')) {
    throw new Error('Selecione um arquivo .epub.');
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `Arquivo muito grande. O limite é ${Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024)} MB.`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  throwIfProcessingAborted(signal);
  state.payload = { file, bytes };
  state.originalSource = { fileName: file.name, bytes };
  state.message = 'Arquivo carregado localmente.';
}

export async function analyzeCurrentFile(
  state: AppState,
  context: ProcessingContext = {},
): Promise<void> {
  if (!state.payload) throw new Error('Envie um EPUB antes de analisá-lo.');
  state.busy = true;
  state.error = undefined;
  try {
    const loaded = await loadZipForTask(state, context);
    publishProgress(context, 'Validando XML, links e recursos...');
    // Entregar a UI um frame para mostrar a fase antes da validação síncrona.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    throwIfProcessingAborted(context.signal);
    const report = inspectLoadedEpub(state.payload.file.name, state.payload.bytes.length, loaded);
    throwIfProcessingAborted(context.signal);
    state.report = report;
    state.repairResult = undefined;
    state.message = canRepairReport(report)
      ? 'Análise concluída no navegador.'
      : readyWithoutRequiredRepairMessage(report);
  } finally {
    state.busy = false;
  }
}

export async function repairCurrentFile(
  state: AppState,
  context: ProcessingContext = {},
): Promise<void> {
  if (!state.payload) throw new Error('Envie um EPUB antes de repará-lo.');
  state.busy = true;
  state.error = undefined;
  // Snapshot antes do primeiro await: alterações na UI não afetam o job ativo.
  const appliedOptions = { ...state.options };
  try {
    const loaded = await loadZipForTask(state, context);
    publishProgress(context, 'Conferindo estrutura e preparando reparo...');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    throwIfProcessingAborted(context.signal);
    const currentReport = state.report ??
      inspectLoadedEpub(state.payload.file.name, state.payload.bytes.length, loaded);
    throwIfProcessingAborted(context.signal);
    state.report = currentReport;

    const canRunRequiredRepair = canRepairReport(currentReport);
    const canRunOptionalOptimization = canOptimizeReport(currentReport);

    if (!canRunRequiredRepair && !canRunOptionalOptimization) {
      state.repairResult = undefined;
      state.message = readyWithoutRequiredRepairMessage(currentReport);
      return;
    }

    publishProgress(context, 'Recompactando e revalidando o EPUB...');
    const result = await repairEpub(
      state.payload.file.name,
      state.payload.bytes,
      appliedOptions,
      canRunOptionalOptimization ? 'optimization' : 'repair',
      loaded,
      context.signal,
    );
    throwIfProcessingAborted(context.signal);
    if (!result.changed || !result.blob) {
      state.repairResult = result.actions.length > 0 ? result : undefined;
      state.report = result.after;
      state.message = hasManualReviewIssues(result.after)
        ? 'Nada foi alterado e ainda existem pendências para revisão manual.'
        : result.operation === 'optimization'
          ? 'A otimização opcional foi avaliada, mas nenhuma alteração automática foi aplicada pelo navegador.'
          : 'Nenhuma correção obrigatória foi necessária.';
      return;
    }

    state.repairResult = result;
    state.lastRepairOptions = appliedOptions;
    state.report = result.after;
    state.message = hasManualReviewIssues(result.after)
      ? 'Alterações aplicadas, mas ainda existem pendências que exigem revisão manual.'
      : result.after.stats.errorCount > 0 || result.after.stats.warningCount > 0
        ? 'Alterações aplicadas; confira os alertas remanescentes antes de usar.'
        : result.operation === 'optimization'
          ? 'Otimização opcional aplicada e EPUB revalidado.'
          : 'Reparo concluído e revalidado.';
  } finally {
    state.busy = false;
  }
}

export async function loadCoverImageIntoState(file: File, state: AppState, signal?: AbortSignal): Promise<void> {
  if (!state.payload) throw new Error('Envie um EPUB antes de escolher uma capa.');

  const image = await readCoverImageFile(file);
  throwIfProcessingAborted(signal);
  state.coverImage = image;
  state.repairResult = undefined;
  state.error = undefined;
  state.message = 'Nova capa carregada, confira a prévia e aplique quando quiser.';
}

export function clearCoverImageFromState(state: AppState): void {
  state.coverImage = undefined;
  state.message = 'Seleção de capa removida.';
}

export async function applyCoverReplacementToCurrentFile(state: AppState, signal?: AbortSignal): Promise<void> {
  if (!state.payload) throw new Error('Envie um EPUB antes de trocar a capa.');
  if (!state.coverImage) throw new Error('Escolha uma imagem de capa antes de aplicar.');

  state.busy = true;
  state.error = undefined;
  try {
    const result = await replaceEpubCover(
      state.payload.file.name,
      state.payload.bytes,
      state.coverImage,
      signal,
    );
    throwIfProcessingAborted(signal);

    if (!result.blob) {
      throw new Error('Não foi possível gerar o EPUB com a nova capa.');
    }

    const outputBytes = new Uint8Array(await result.blob.arrayBuffer());
    throwIfProcessingAborted(signal);
    state.payload = {
      file: new File([result.blob], result.fileName, { type: 'application/epub+zip' }),
      bytes: outputBytes,
    };
    state.repairResult = result;
    state.report = result.after;
    state.coverImage = undefined;
    state.lastRepairOptions = undefined;
    state.message = 'Capa aplicada e EPUB revalidado.';
  } finally {
    state.busy = false;
  }
}

function readyWithoutRequiredRepairMessage(report: NonNullable<AppState['report']>): string {
  if (report.stats.fatalCount > 0) {
    return 'EPUB inválido: o reparo automático foi bloqueado por problema fatal.';
  }
  if (hasManualReviewIssues(report)) {
    return 'O EPUB tem problemas sem reparo automático. Consulte as pendências para revisão manual.';
  }
  if (hasOptionalOptimizations(report)) {
    return 'Análise concluída: não há correções obrigatórias. Há apenas melhorias opcionais de compatibilidade.';
  }

  return 'Seu EPUB já está pronto, nenhuma correção é necessária.';
}
