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
  completed?: number, total?: number, unit?: ProcessingProgress['unit']): void {
  context.onProgress?.({ phase,
    ...(completed !== undefined ? { completed } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(unit ? { unit } : {}),
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
  if (bytes.length > MAX_FILE_SIZE_BYTES) {
    throw new Error('O arquivo excede o limite permitido de tamanho.');
  }
  state.error = undefined;
  state.report = undefined;
  state.repairResult = undefined;
  state.coverImage = undefined;
  state.lastRepairOptions = undefined;
  state.payload = { file, bytes };
  state.originalSource = { fileName: file.name, bytes };
  state.message = 'Arquivo carregado localmente.';
}






export async function loadAndAnalyzeCandidate(
  file: File, state: AppState, context: ProcessingContext = {},
): Promise<void> {
  const candidate: AppState = {
    ...state,
    payload: undefined,
    originalSource: undefined,
    repairResult: undefined,
    report: undefined,
    coverImage: undefined,
    lastRepairOptions: undefined,
    invalidUploadReport: undefined,
  };
  await loadFileIntoState(file, candidate, context.signal);
  await analyzeCurrentFile(candidate, context);
  throwIfProcessingAborted(context.signal);
  if (state.payload && candidate.report &&
      (!candidate.report.validZip || candidate.report.stats.fatalCount > 0)) {
    state.invalidUploadReport = candidate.report;
    state.message = 'O novo EPUB tem problemas fatais. A cópia anterior foi preservada para download; ' +
      'confira abaixo o diagnóstico do arquivo recusado.';
    return;
  }
  state.payload = candidate.payload;
  state.originalSource = candidate.originalSource;
  state.repairResult = candidate.repairResult;
  state.report = candidate.report;
  state.coverImage = candidate.coverImage;
  state.lastRepairOptions = candidate.lastRepairOptions;
  state.invalidUploadReport = undefined;
  state.message = candidate.message;
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
    
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    throwIfProcessingAborted(context.signal);
    const report = inspectLoadedEpub(state.payload.file.name, state.payload.bytes.length, loaded);
    throwIfProcessingAborted(context.signal);
    state.report = report;
    
    if (state.repairResult?.fileName !== state.payload.file.name) {
      state.repairResult = undefined;
    }
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

    const canRunRequiredRepair = canRepairReport(currentReport, appliedOptions);
    const canRunOptionalOptimization = canOptimizeReport(currentReport) ||
      Boolean(appliedOptions.stripImageMetadata &&
        currentReport.issues.some((issue) => issue.code === 'IMAGE_EMBEDDED_METADATA'));

    if (!canRunRequiredRepair && !canRunOptionalOptimization) {
      
      state.message = readyWithoutRequiredRepairMessage(currentReport);
      return;
    }

    publishProgress(context, 'Recompactando e revalidando o EPUB...');
    const result = await repairEpub(
      state.payload.file.name,
      state.payload.bytes,
      appliedOptions,
      canRunRequiredRepair ? 'repair' : 'optimization',
      loaded,
      context.signal,
      (percent) => publishProgress(context, 'Recompactando EPUB...', Math.round(percent), 100, 'percent'),
    );
    throwIfProcessingAborted(context.signal);
    if (!result.changed || !result.blob) {
      
      state.report = result.after;
      state.message = hasManualReviewIssues(result.after)
        ? 'Nada foi alterado e ainda existem pendências para revisão manual.'
        : result.operation === 'optimization'
          ? 'A otimização opcional foi avaliada, mas nenhuma alteração automática foi aplicada pelo navegador.'
          : 'Nenhuma correção obrigatória foi necessária.';
      return;
    }

    
    
    const repairedBytes = new Uint8Array(await result.blob.arrayBuffer());
    throwIfProcessingAborted(context.signal);
    state.payload = {
      file: new File([result.blob], result.fileName, { type: 'application/epub+zip' }),
      bytes: repairedBytes,
    };
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
  
  state.error = undefined;
  state.message = 'Nova capa carregada, confira a prévia e aplique quando quiser.';
}

export function clearCoverImageFromState(state: AppState): void {
  state.coverImage = undefined;
  state.message = 'Seleção de capa removida.';
}

export async function applyCoverReplacementToCurrentFile(
  state: AppState,
  signal?: AbortSignal,
  onProgress?: (progress: ProcessingProgress) => void,
): Promise<void> {
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
      (percent) => onProgress?.({
        phase: 'Recompactando EPUB com nova capa...',
        completed: Math.round(percent),
        total: 100,
        unit: 'percent',
      }),
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
