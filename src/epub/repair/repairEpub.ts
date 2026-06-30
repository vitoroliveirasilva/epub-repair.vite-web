import type { RepairAction, RepairOptions, RepairResult } from '../model/repairTypes';
import { loadEpub } from '../reader/loadEpub';
import { inspectEpub } from '../validation/validateEpub';
import { DEFAULT_REPAIR_OPTIONS, SYSTEM_FILE_PATTERNS } from '../utils/constants';
import { makeRepairedFileName } from '../utils/fileName';
import { normalizeInternalPath } from '../utils/pathUtils';
import { parsePackageDocument } from '../validation/opfParser';
import { ensureContainerFile } from './repairContainer';
import { repairContentDocuments } from './repairContentDocuments';
import { repairOpfDocument } from './repairOpf';
import { rebuildEpubZip } from './rebuildEpubZip';

export async function repairEpub(
  fileName: string,
  bytes: Uint8Array,
  options: RepairOptions = DEFAULT_REPAIR_OPTIONS,
): Promise<RepairResult> {
  const before = await inspectEpub(fileName, bytes);
  const loaded = await loadEpub(fileName, bytes);
  const warnings: string[] = [];

  if (!loaded.validZip) {
    throw new Error('Não é seguro reparar: o arquivo não pôde ser aberto como ZIP/EPUB válido.');
  }

  const parsed = parsePackageDocument(loaded);
  if (!parsed.packageInfo) {
    throw new Error(
      'Não é seguro reparar automaticamente: o OPF do EPUB não foi encontrado ou está inválido.',
    );
  }

  const actions: RepairAction[] = [
    ...parsed.issues.map(
      (issue): RepairAction => ({
        type: 'skipped' as const,
        title: issue.title,
        detail: issue.detail,
        file: issue.file,
      }),
    ),
  ];
  const files = new Map<string, Uint8Array>();

  for (const [path, entry] of loaded.files) {
    const normalized = normalizeInternalPath(path);
    if (!normalized.safe) {
      actions.push({
        type: 'removed',
        title: 'Arquivo com caminho inseguro removido',
        detail: normalized.reason ?? 'O caminho não era seguro para permanecer no pacote.',
        file: path,
      });
      continue;
    }

    if (options.stripSystemFiles && SYSTEM_FILE_PATTERNS.some((pattern) => pattern.test(path))) {
      actions.push({
        type: 'removed',
        title: 'Arquivo de sistema removido',
        detail: 'Arquivo gerado por sistema operacional não faz parte do livro.',
        file: path,
      });
      continue;
    }

    files.set(path, entry.bytes);
  }

  if (options.normalizeMimetype) {
    files.set('mimetype', new TextEncoder().encode('application/epub+zip'));
    actions.push({
      type: 'normalized',
      title: 'mimetype normalizado',
      detail: 'O mimetype será escrito como primeira entrada e sem compressão no EPUB final.',
      file: 'mimetype',
    });
  }

  const opfRepair = repairOpfDocument(loaded, parsed.packageInfo, fileName, options);
  files.set(parsed.packageInfo.opfPath, new TextEncoder().encode(opfRepair.opfText));
  for (const [path, text] of opfRepair.filesToAdd) {
    files.set(path, new TextEncoder().encode(text));
  }
  actions.push(...opfRepair.actions);

  if (options.rebuildContainer) {
    actions.push(ensureContainerFile(files, parsed.packageInfo.opfPath));
  }

  actions.push(...repairContentDocuments(files, loaded, parsed.packageInfo, options));

  if (actions.length === 0) {
    warnings.push('Nenhuma alteração automática foi necessária.');
  }

  const blob = await rebuildEpubZip(files);
  const afterBytes = new Uint8Array(await blob.arrayBuffer());
  const after = await inspectEpub(makeRepairedFileName(fileName), afterBytes);

  return {
    blob,
    fileName: makeRepairedFileName(fileName),
    before,
    after,
    actions,
    warnings,
  };
}
