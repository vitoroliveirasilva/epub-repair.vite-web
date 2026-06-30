import { inspectEpub, MAX_FILE_SIZE_BYTES, repairEpub } from '../epub';
import type { AppState } from './state';

export async function loadFileIntoState(file: File, state: AppState): Promise<void> {
  state.error = undefined;
  state.message = undefined;
  state.repairResult = undefined;
  state.report = undefined;

  if (!file.name.toLowerCase().endsWith('.epub')) {
    throw new Error(
      'Selecione um arquivo .epub.',
    );
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
    state.message = 'Análise concluída no navegador.';
  } finally {
    state.busy = false;
  }
}

export async function repairCurrentFile(state: AppState): Promise<void> {
  if (!state.payload) throw new Error('Envie um EPUB antes de repará-lo.');
  state.busy = true;
  state.error = undefined;
  try {
    state.repairResult = await repairEpub(
      state.payload.file.name,
      state.payload.bytes,
      state.options,
    );
    state.report = state.repairResult.after;
    state.message = 'Reparo concluído e revalidado.';
  } finally {
    state.busy = false;
  }
}
