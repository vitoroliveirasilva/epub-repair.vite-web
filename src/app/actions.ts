import {
  canOptimizeReport,
  canRepairReport,
  hasOptionalOptimizations,
  inspectEpub,
  MAX_FILE_SIZE_BYTES,
  readCoverImageFile,
  repairEpub,
  replaceEpubCover,
} from '../epub';
import type { AppState } from './state';

export async function loadFileIntoState(file: File, state: AppState): Promise<void> {
  state.error = undefined;
  state.message = undefined;
  state.repairResult = undefined;
  state.report = undefined;
  state.coverImage = undefined;

  if (!file.name.toLowerCase().endsWith('.epub')) {
    throw new Error('Selecione um arquivo .epub.');
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `Arquivo muito grande. O limite é ${Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024)} MB.`,
    );
  }

  state.payload = {
    file,
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
  state.message = 'Arquivo carregado localmente.';
}

export async function analyzeCurrentFile(state: AppState): Promise<void> {
  if (!state.payload) throw new Error('Envie um EPUB antes de analisá-lo.');
  state.busy = true;
  state.error = undefined;
  try {
    state.report = await inspectEpub(state.payload.file.name, state.payload.bytes);
    state.repairResult = undefined;
    state.message = canRepairReport(state.report)
      ? 'Análise concluída no navegador.'
      : readyWithoutRequiredRepairMessage(state.report);
  } finally {
    state.busy = false;
  }
}

export async function repairCurrentFile(state: AppState): Promise<void> {
  if (!state.payload) throw new Error('Envie um EPUB antes de repará-lo.');
  state.busy = true;
  state.error = undefined;
  try {
    const currentReport =
      state.report ?? (await inspectEpub(state.payload.file.name, state.payload.bytes));
    state.report = currentReport;

    const canRunRequiredRepair = canRepairReport(currentReport);
    const canRunOptionalOptimization = canOptimizeReport(currentReport);

    if (!canRunRequiredRepair && !canRunOptionalOptimization) {
      state.repairResult = undefined;
      state.message = readyWithoutRequiredRepairMessage(currentReport);
      return;
    }

    const result = await repairEpub(
      state.payload.file.name,
      state.payload.bytes,
      state.options,
      canRunOptionalOptimization ? 'optimization' : 'repair',
    );
    if (!result.changed || !result.blob) {
      state.repairResult = undefined;
      state.report = result.after;
      state.message =
        result.operation === 'optimization'
          ? 'A otimização opcional foi avaliada, mas nenhuma alteração automática foi aplicada pelo navegador.'
          : 'Nenhuma correção obrigatória foi necessária.';
      return;
    }

    state.repairResult = result;
    state.report = result.after;
    state.message =
      result.operation === 'optimization'
        ? 'Otimização opcional aplicada e EPUB revalidado.'
        : 'Reparo concluído e revalidado.';
  } finally {
    state.busy = false;
  }
}

export async function loadCoverImageIntoState(file: File, state: AppState): Promise<void> {
  if (!state.payload) throw new Error('Envie um EPUB antes de escolher uma capa.');

  state.coverImage = await readCoverImageFile(file);
  state.repairResult = undefined;
  state.error = undefined;
  state.message = 'Nova capa carregada, confira a prévia e aplique quando quiser.';
}

export function clearCoverImageFromState(state: AppState): void {
  state.coverImage = undefined;
  state.message = 'Seleção de capa removida.';
}

export async function applyCoverReplacementToCurrentFile(state: AppState): Promise<void> {
  if (!state.payload) throw new Error('Envie um EPUB antes de trocar a capa.');
  if (!state.coverImage) throw new Error('Escolha uma imagem de capa antes de aplicar.');

  state.busy = true;
  state.error = undefined;
  try {
    const result = await replaceEpubCover(
      state.payload.file.name,
      state.payload.bytes,
      state.coverImage,
    );

    if (!result.blob) {
      throw new Error('Não foi possível gerar o EPUB com a nova capa.');
    }

    const outputBytes = new Uint8Array(await result.blob.arrayBuffer());
    state.payload = {
      file: new File([result.blob], result.fileName, { type: 'application/epub+zip' }),
      bytes: outputBytes,
    };
    state.repairResult = result;
    state.report = result.after;
    state.coverImage = undefined;
    state.message = 'Capa aplicada e EPUB revalidado.';
  } finally {
    state.busy = false;
  }
}

function readyWithoutRequiredRepairMessage(report: NonNullable<AppState['report']>): string {
  if (hasOptionalOptimizations(report)) {
    return 'Análise concluída: não há correções obrigatórias. Há apenas melhorias opcionais de compatibilidade.';
  }

  return 'Seu EPUB já está pronto, nenhuma correção é necessária.';
}
