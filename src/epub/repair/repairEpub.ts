import type { RepairAction, RepairOptions, RepairResult } from '../model/repairTypes';
import type { LoadedEpub } from '../model/epubTypes';
import { loadEpub } from '../reader/loadEpub';
import { inspectEpub, inspectLoadedEpub } from '../validation/validateEpub';
import { DEFAULT_REPAIR_OPTIONS, EPUB_MIME, SYSTEM_FILE_PATTERNS } from '../utils/constants';
import { makeRepairedFileName } from '../utils/fileName';
import { normalizeInternalPath } from '../utils/pathUtils';
import { canOptimizeReport, canRepairReport, hasResidualActiveContent } from '../utils/reportGuards';
import { parsePackageDocument, parseOpfDocument } from '../validation/opfParser';
import { parseXml } from '../utils/xmlUtils';
import { auditPreservation } from './preservationAudit';
import { createTextFileDiffs } from './textFileDiff';
import { assertNoNewCriticalIssues } from './repairSafety';
import { ensureContainerFile } from './repairContainer';
import { repairActiveContentOnly, repairContentDocuments } from './repairContentDocuments';
import { repairImageCompatibility } from './repairImages';
import { repairKindleCompatibility } from './repairKindleCompatibility';
import { repairOpfDocument } from './repairOpf';
import { synchronizeManifestProperties } from './synchronizeManifestProperties';
import { rebuildEpubZip } from './rebuildEpubZip';

type RepairRunMode = 'repair' | 'optimization';

export async function repairEpub(
  fileName: string,
  bytes: Uint8Array,
  options: RepairOptions = DEFAULT_REPAIR_OPTIONS,
  mode: RepairRunMode = 'repair',
  preloaded?: LoadedEpub,
  signal?: AbortSignal,
  onZipProgress?: (percent: number) => void,
): Promise<RepairResult> {
  const canceled = (): void => {
    if (signal?.aborted) throw new DOMException(
      'Operação cancelada pelo usuário.', 'AbortError');
  };
  canceled();
  const loaded = preloaded ?? await loadEpub(fileName, bytes, undefined, signal);
  canceled();
  const before = inspectLoadedEpub(fileName, bytes.length, loaded);
  const warnings: string[] = [];

  const canRunRequiredRepair = canRepairReport(before);
  const canRunOptionalOptimization = canOptimizeReport(before);
  const shouldRun = mode === 'optimization' ? canRunOptionalOptimization : canRunRequiredRepair;
  const operation = mode === 'optimization' ? 'optimization' : 'repair';

  if (!shouldRun) {
    return {
      fileName,
      before,
      after: before,
      actions: [],
      warnings: [
        mode === 'optimization'
          ? 'Nenhuma otimização opcional está disponível para aplicação automática.'
          : 'Nenhuma correção obrigatória foi necessária.',
      ],
      changed: false,
      operation,
    };
  }

  if (!loaded.validZip) {
    throw new Error('Não é seguro reparar: o arquivo não pôde ser aberto como ZIP/EPUB válido.');
  }

  const parsed = parsePackageDocument(loaded);
  if (!parsed.packageInfo) {
    throw new Error(
      'Não é seguro reparar automaticamente: o OPF do EPUB não foi encontrado ou está inválido.',
    );
  }

  // Uma otimização isolada não reexecuta reparos do OPF ou do conteúdo.
  if (mode === 'optimization') {
    const optimizedFiles = new Map<string, Uint8Array>();
    for (const [path, entry] of loaded.files) optimizedFiles.set(path, entry.bytes);
    const attempted = await repairImageCompatibility(optimizedFiles, parsed.packageInfo, options);
    canceled();
    const applied = attempted.filter((action) => action.type !== 'skipped');
    warnings.push(...attempted.filter((action) => action.type === 'skipped')
      .map((action) => `Não aplicado: ${action.title}. ${action.detail}`));

    if (applied.length === 0) {
      return {
        fileName, before, after: before, actions: attempted,
        warnings: [...warnings, 'O navegador não conseguiu aplicar uma otimização opcional.'],
        changed: false, operation,
      };
    }
    const blob = await rebuildEpubZip(optimizedFiles, ({ percent }) => onZipProgress?.(percent));
    canceled();
    const outName = makeRepairedFileName(fileName);
    const after = await inspectEpub(outName, new Uint8Array(await blob.arrayBuffer()));
    canceled();
    assertNoNewCriticalIssues(before, after);
    if (hasResidualActiveContent(after)) {
      warnings.push('Otimização concluída, mas ainda existem recursos suspeitos ou conteúdo ativo a revisar.');
    }
    return { blob, fileName: outName, before, after, actions: attempted, warnings,
      fileDiffs: createTextFileDiffs(new Map(Array.from(loaded.files, ([name, entry]) =>
        [name, entry.bytes])), optimizedFiles), changed: true, operation };
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

  // Inspecionar o manifest efetivo também em modo conservador. O OPF reparado
  // pode declarar XHTML/SVG/CSS que antes eram órfãos no pacote.
  const currentOpf = files.get(parsed.packageInfo.opfPath);
  const currentPkg = currentOpf
    ? parseOpfDocument(
        parseXml(new TextDecoder('utf-8').decode(currentOpf)),
        parsed.packageInfo.opfPath,
        files,
      )
    : parsed.packageInfo;
  if (!options.conservativeMode) {
    actions.push(...repairContentDocuments(files, loaded, currentPkg, options));
  } else {
    // O modo conservador não reescreve conteúdo por compatibilidade, mas
    // respeita o opt-in explícito de remover scripts ou recursos remotos.
    actions.push(...repairActiveContentOnly(files, currentPkg, options));
    warnings.push(
      options.sanitizeScripts
        ? 'Modo conservador: somente elementos ativos e URLs selecionadas foram neutralizados; ' +
          'a tipografia e os recursos não perigosos foram preservados sempre que possível.'
        : 'Modo conservador: scripts foram preservados por escolha do usuário; ' +
          'conteúdo ativo residual exige revisão manual.',
    );
  }

  actions.push(...repairKindleCompatibility(files, parsed.packageInfo, options));
  // Manifest precisa refletir os recursos efetivos, após a limpeza. Isso
  // evita avisos novos quando o reparo declara arquivos antes órfãos.
  if (options.repairManifest) {
    actions.push(...synchronizeManifestProperties(files, parsed.packageInfo));
  }
  // E-009: JPEG progressivo só muda na otimização explicitamente solicitada.

  const appliedActions = actions.filter((action) => action.type !== 'skipped');
  const skippedActions = actions.filter((action) => action.type === 'skipped');
  warnings.push(...skippedActions.map((action) =>
    `Não aplicado: ${action.title}. ${action.detail}`));
  if (appliedActions.length === 0) {
    return {
      fileName,
      before,
      after: before,
      actions: skippedActions,
      warnings: [
        ...warnings,
        hasResidualActiveContent(before)
          ? 'Nenhuma alteração foi aplicada e o EPUB ainda contém sinais de conteúdo ativo ou recursos suspeitos.'
          : operation === 'optimization'
            ? 'A otimização opcional foi avaliada, mas nenhuma alteração automática foi aplicada.'
            : 'Nenhuma alteração automática foi aplicada.',
      ],
      changed: false,
      operation,
    };
  }

  canceled();
  const blob = await rebuildEpubZip(files, ({ percent }) => onZipProgress?.(percent));
  canceled();
  const afterBytes = new Uint8Array(await blob.arrayBuffer());
  const outputFileName = makeRepairedFileName(fileName);
  const after = await inspectEpub(outputFileName, afterBytes);
  canceled();
  assertNoNewCriticalIssues(before, after);
  warnings.push(...auditPreservation(loaded, files, parsed.packageInfo, after.packageInfo));
  const fileDiffs = createTextFileDiffs(new Map(Array.from(loaded.files, ([name, entry]) =>
    [name, entry.bytes])), files);
  if (hasResidualActiveContent(after)) {
    warnings.push('O reparo ainda apresenta conteúdo ativo ou recursos suspeitos: exige revisão manual.');
  }

  return {
    blob,
    fileName: outputFileName,
    before,
    after,
    actions,
    warnings,
    fileDiffs,
    changed: true,
    operation,
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
  // Múltiplos rootfiles podem representar renditions legítimas. Este aviso
  // informativo NUNCA autoriza substituir o container e perder outras edições.
  const missingOrBroken = new Set([
    'CONTAINER_MISSING', 'CONTAINER_INVALID_XML', 'CONTAINER_NO_ROOTFILE',
  ]);
  return issues.some((issue) => missingOrBroken.has(issue.code));
}
