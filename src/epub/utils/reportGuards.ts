import type { ValidationReport } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';

/** Conteúdo ativo não neutralizado ou binário suspeito exige revisão humana. */
export function hasResidualActiveContent(report: ValidationReport | undefined): boolean {
  return Boolean(report?.issues.some((issue) =>
    /^(?:CONTENT_(?:SCRIPTED|UNSAFE)|CSS_UNSAFE_RESOURCE|PACKAGE_(?:SUSPICIOUS_EXECUTABLE|DECLARED_SCRIPT|UNDECLARED_ACTIVE_CONTENT|UNDECLARED_SCRIPT))/u.test(issue.code),
  ));
}

/** Alertas graves sem solução automática disponível não significam EPUB pronto. */
export function hasManualReviewIssues(report: ValidationReport | undefined): boolean {
  // O app valida uma rendition por vez; a presença de outros rootfiles
  // nunca significa EPUB globalmente validado, mesmo se todos os scores forem altos.
  return hasResidualActiveContent(report) ||
    Boolean(report?.packageInfo && report.packageInfo.rootfileCount > 1) ||
    Boolean(report?.issues.some((issue) =>
    !issue.repairable &&
    (issue.severity === 'fatal' || issue.severity === 'error' || issue.severity === 'warning'),
  ));
}

export function isRequiredRepairableIssue(issue: Issue): boolean {
  return issue.repairable && issue.severity !== 'info' && issue.severity !== 'success';
}

export function isOptionalOptimizationIssue(issue: Issue): boolean {
  return issue.repairable && issue.severity === 'info';
}

export function getRequiredRepairableCount(report: ValidationReport | undefined): number {
  return report?.issues.filter(isRequiredRepairableIssue).length ?? 0;
}

export function getOptionalOptimizationCount(report: ValidationReport | undefined): number {
  return report?.issues.filter(isOptionalOptimizationIssue).length ?? 0;
}

export function hasRepairableIssues(report: ValidationReport | undefined): boolean {
  return getRequiredRepairableCount(report) > 0;
}

export function hasOptionalOptimizations(report: ValidationReport | undefined): boolean {
  return getOptionalOptimizationCount(report) > 0;
}

export function canRepairReport(report: ValidationReport | undefined): boolean {
  return Boolean(report?.validZip && report.stats.fatalCount === 0 && hasRepairableIssues(report));
}

export function canOptimizeReport(report: ValidationReport | undefined): boolean {
  return Boolean(
    report?.validZip &&
    report.stats.fatalCount === 0 &&
    !hasRepairableIssues(report) &&
    hasOptionalOptimizations(report),
  );
}
