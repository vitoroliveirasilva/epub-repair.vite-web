import {
  getOptionalOptimizationCount,
  getRequiredRepairableCount,
  isOptionalOptimizationIssue,
  isRequiredRepairableIssue,
  type CoverReportInfo,
  type Issue,
  type RepairResult,
  type ValidationReport,
} from '../epub';

export function buildTextReport(report: ValidationReport, repair?: RepairResult): string {
  const lines = [
    `Arquivo: ${report.fileName}`,
    `OPF: ${report.opfPath ?? 'não encontrado'}`,
    `Versão EPUB: ${report.epubVersion ?? 'não identificada'}`,
    `Score Kindle: ${report.stats.kindleScore}`,
    `Score estrutura: ${report.stats.structureScore}`,
    `Score compatibilidade: ${report.stats.compatibilityScore}`,
    `Score segurança: ${report.stats.securityScore}`,
    `Fatais: ${report.stats.fatalCount} | Erros: ${report.stats.errorCount} | Avisos: ${report.stats.warningCount} | Informações: ${report.stats.infoCount}`,
    `Reparos obrigatórios: ${getRequiredRepairableCount(report)} | Otimizações opcionais: ${getOptionalOptimizationCount(report)}`,
    '',
    'Capa:',
    `- Status: ${coverStatus(report)}`,
    report.cover?.path ? `- Arquivo: ${report.cover.path}` : '- Arquivo: não detectado',
    report.cover?.mediaType ? `- Media type: ${report.cover.mediaType}` : undefined,
    report.cover?.note ? `- Observação: ${report.cover.note}` : undefined,
    '',
    'Problemas:',
    ...(report.issues.length > 0
      ? report.issues.map(formatIssue)
      : ['- Nenhum problema encontrado.']),
  ].filter((line): line is string => Boolean(line));

  if (repair) {
    const operationTitle = operationReportTitle(repair);
    lines.push(
      '',
      `${operationTitle}:`,
      `Arquivo gerado: ${repair.fileName}`,
      `Depois da operação: ${repair.after.stats.fatalCount} fatais, ${repair.after.stats.errorCount} erros, ${repair.after.stats.warningCount} avisos, score ${repair.after.stats.kindleScore}`,
      `Reparos obrigatórios após operação: ${getRequiredRepairableCount(repair.after)} | Otimizações opcionais após operação: ${getOptionalOptimizationCount(repair.after)}`,
      '',
      'Alterações aplicadas:',
      ...(repair.actions.length > 0
        ? repair.actions.map(
            (action) =>
              `- ${action.title}${action.file ? ` em ${action.file}` : ''}: ${action.detail}`,
          )
        : ['- Nenhuma alteração automática registrada.']),
    );

    if (repair.warnings.length > 0) {
      lines.push('', 'Observações:', ...repair.warnings.map((warning) => `- ${warning}`));
    }
  }

  return lines.join('\n');
}

function operationReportTitle(repair: RepairResult): string {
  if (repair.operation === 'cover-replacement') return 'Troca de capa';
  if (repair.operation === 'optimization') return 'Otimização opcional';
  return 'Reparo';
}

export function buildJsonReport(report: ValidationReport, repair?: RepairResult): string {
  return JSON.stringify(
    {
      report: toSerializableReport(report),
      repair: repair
        ? {
            fileName: repair.fileName,
            before: toSerializableReport(repair.before),
            after: toSerializableReport(repair.after),
            actions: repair.actions,
            warnings: repair.warnings,
            changed: repair.changed,
            operation: repair.operation,
          }
        : undefined,
    },
    null,
    2,
  );
}

export function makeReportFileName(fileName: string, extension: 'txt' | 'json'): string {
  const base = fileName.replace(/\.epub$/iu, '').replace(/[^\p{L}\p{N}._-]+/gu, '-');
  return `${base || 'relatorio-epub'}-relatorio.${extension}`;
}

function formatIssue(issue: Issue): string {
  return `- [${issue.severity.toUpperCase()}] ${issueLabel(issue)} ${issue.code}${issue.file ? ` em ${issue.file}` : ''}: ${issue.title} - ${issue.detail}`;
}

function issueLabel(issue: Issue): string {
  if (isOptionalOptimizationIssue(issue)) return '[OTIMIZAÇÃO OPCIONAL]';
  if (isRequiredRepairableIssue(issue)) return '[REPARO OBRIGATÓRIO]';
  return '[MANUAL/INFO]';
}

function coverStatus(report: ValidationReport): string {
  if (!report.cover || report.cover.source === 'none') return 'não detectada';
  if (report.cover.declared && report.cover.exists) return 'declarada no OPF';
  if (report.cover.exists) return 'detectada, mas não declarada oficialmente';
  return 'declarada, mas ausente no pacote';
}

function stripCoverPreview(
  cover: CoverReportInfo | undefined,
): Omit<CoverReportInfo, 'previewDataUrl'> | undefined {
  if (!cover) return undefined;

  return {
    declared: cover.declared,
    exists: cover.exists,
    source: cover.source,
    ...(cover.path ? { path: cover.path } : {}),
    ...(cover.mediaType ? { mediaType: cover.mediaType } : {}),
    ...(cover.note ? { note: cover.note } : {}),
  };
}

function toSerializableReport(report: ValidationReport): object {
  return {
    fileName: report.fileName,
    fileSize: report.fileSize,
    generatedAt: report.generatedAt,
    validZip: report.validZip,
    opfPath: report.opfPath,
    epubVersion: report.epubVersion,
    cover: stripCoverPreview(report.cover),
    stats: {
      ...report.stats,
      requiredRepairableCount: getRequiredRepairableCount(report),
      optionalOptimizationCount: getOptionalOptimizationCount(report),
    },
    issues: report.issues,
    zipEntries: report.zipEntries,
    packageInfo: report.packageInfo
      ? {
          opfPath: report.packageInfo.opfPath,
          opfDir: report.packageInfo.opfDir,
          version: report.packageInfo.version,
          metadata: report.packageInfo.metadata,
          manifestCount: report.packageInfo.manifest.length,
          spineCount: report.packageInfo.spine.length,
          navPath: report.packageInfo.navItem?.resolvedPath,
          ncxPath: report.packageInfo.ncxItem?.resolvedPath,
          coverPath: report.packageInfo.coverItem?.resolvedPath,
          coverMetaDeclared: report.packageInfo.coverMetaDeclared,
          rootfileCount: report.packageInfo.rootfileCount,
        }
      : undefined,
  };
}
