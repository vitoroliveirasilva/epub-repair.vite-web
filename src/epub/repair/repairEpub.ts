import type { RepairAction, RepairOptions, RepairResult } from '../model/repairTypes';
import { loadEpub } from '../reader/loadEpub';
import { inspectEpub } from '../validation/validateEpub';
import { DEFAULT_REPAIR_OPTIONS, EPUB_MIME, SYSTEM_FILE_PATTERNS } from '../utils/constants';
import { makeRepairedFileName } from '../utils/fileName';
import { normalizeInternalPath } from '../utils/pathUtils';
import { canRepairReport } from '../utils/reportGuards';
import { parsePackageDocument } from '../validation/opfParser';
import { ensureContainerFile } from './repairContainer';
import { repairContentDocuments } from './repairContentDocuments';
import { repairImageCompatibility } from './repairImages';
import { repairKindleCompatibility } from './repairKindleCompatibility';
import { repairOpfDocument } from './repairOpf';
import { rebuildEpubZip } from './rebuildEpubZip';

export async function repairEpub(
  fileName: string,
  bytes: Uint8Array,
  options: RepairOptions = DEFAULT_REPAIR_OPTIONS,
): Promise<RepairResult> {
  const before = await inspectEpub(fileName, bytes);
  const warnings: string[] = [];

  if (!canRepairReport(before)) {
    return {
      fileName,
      before,
      after: before,
      actions: [],
      warnings: ['Nenhuma correção obrigatória foi necessária'],
      changed: false,
      operation: 'repair',
    };
  }

  const loaded = await loadEpub(fileName, bytes);

  if (!loaded.validZip) {
    throw new Error('Não é seguro reparar: o arquivo não pôde ser aberto como ZIP/EPUB válido.');
  }

  const parsed = parsePackageDocument(loaded);
  if (!parsed.packageInfo) {
    throw new Error(
      'Não é seguro reparar automaticamente: o OPF do EPUB não foi encontrado ou está inválido.',
    );
  }

  const actions: RepairAction[] = [];
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

  if (options.normalizeMimetype && shouldNormalizeMimetype(before.issues, files)) {
    files.set('mimetype', new TextEncoder().encode(EPUB_MIME));
    actions.push({
      type: 'normalized',
      title: 'mimetype normalizado',
      detail: 'O mimetype será escrito como primeira entrada e sem compressão no EPUB final.',
      file: 'mimetype',
    });
  }

  const opfRepair = repairOpfDocument(loaded, parsed.packageInfo, fileName, options);
  if (opfRepair.actions.length > 0 || opfRepair.filesToAdd.size > 0) {
    files.set(parsed.packageInfo.opfPath, new TextEncoder().encode(opfRepair.opfText));
    for (const [path, text] of opfRepair.filesToAdd) {
      files.set(path, new TextEncoder().encode(text));
    }
    actions.push(...opfRepair.actions);
  }

  if (options.rebuildContainer && shouldRebuildContainer(before.issues)) {
    actions.push(ensureContainerFile(files, parsed.packageInfo.opfPath));
  }

  if (!options.conservativeMode) {
    actions.push(...repairContentDocuments(files, loaded, parsed.packageInfo, options));
  } else {
    warnings.push(
      'O modo conservador está ativo, então XHTML, CSS e imagens foram preservados sempre que possível.',
    );
  }

  actions.push(...repairKindleCompatibility(files, parsed.packageInfo, options));
  actions.push(...(await repairImageCompatibility(files, parsed.packageInfo, options)));

  const appliedActions = actions.filter((action) => action.type !== 'skipped');
  if (appliedActions.length === 0) {
    return {
      fileName,
      before,
      after: before,
      actions: [],
      warnings: ['Nenhuma alteração automática foi aplicada.'],
      changed: false,
      operation: 'repair',
    };
  }

  const blob = await rebuildEpubZip(files);
  const afterBytes = new Uint8Array(await blob.arrayBuffer());
  const outputFileName = makeRepairedFileName(fileName);
  const after = await inspectEpub(outputFileName, afterBytes);

  return {
    blob,
    fileName: outputFileName,
    before,
    after,
    actions: appliedActions,
    warnings,
    changed: true,
    operation: 'repair',
  };
}

function shouldNormalizeMimetype(
  issues: { code: string }[],
  files: Map<string, Uint8Array>,
): boolean {
  if (issues.some((issue) => issue.code.startsWith('MIME_'))) return true;

  const mimetype = files.get('mimetype');
  if (!mimetype) return true;

  return new TextDecoder('utf-8', { fatal: false }).decode(mimetype).trim() !== EPUB_MIME;
}

function shouldRebuildContainer(issues: { code: string }[]): boolean {
  return issues.some((issue) => issue.code.startsWith('CONTAINER_'));
}
