import { MAX_BATCH_BYTES, MAX_BATCH_FILES } from './batchProcessor';

export interface BatchSelectionResult {
  files: File[];
  added: number;
  ignored: number;
  error?: string | undefined;
}

export function addBatchSelection(
  current: readonly File[], incoming: readonly File[],
): BatchSelectionResult {
  const supported = incoming.filter((file) =>
    /\.epub$/iu.test(file.name) && file.size > 0);
  const ignored = incoming.length - supported.length;
  const files = [...current];
  for (const file of supported) {
    if (files.some((existing) => existing.name === file.name &&
      existing.size === file.size && existing.lastModified === file.lastModified)) continue;
    files.push(file);
  }
  if (files.length > MAX_BATCH_FILES) {
    return { files: [...current], added: 0, ignored,
      error: 'O lote permite de 1 a ' + MAX_BATCH_FILES + ' EPUBs. ' +
        'Remova alguns arquivos para adicionar outros.' };
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_BYTES) {
    return { files: [...current], added: 0, ignored,
      error: 'Os EPUBs selecionados excedem 80 MB somados. ' +
        'Remova alguns arquivos e tente novamente.' };
  }
  if (!supported.length) {
    return { files: [...current], added: 0, ignored,
      error: incoming.length ? 'Nenhum EPUB válido foi escolhido. Selecione arquivos .epub não vazios.'
        : 'Selecione um ou mais EPUBs para processar.' };
  }
  return { files, added: files.length - current.length, ignored };
}
