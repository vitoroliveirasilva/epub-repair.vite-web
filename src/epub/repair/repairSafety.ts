import type { ValidationReport } from '../model/epubTypes';

/** Não disponibiliza uma cópia que ganhou novos erros críticos após a modificação. */
export function assertNoNewCriticalIssues(
  before: ValidationReport,
  after: ValidationReport,
): void {
  const isCritical = (issue: { severity: string }) =>
    issue.severity === 'fatal' || issue.severity === 'error';
  const known = new Set(
    before.issues.filter(isCritical).map((issue) => `${issue.code}|${issue.file ?? ''}`),
  );
  const added = after.issues.filter(isCritical)
    .filter((issue) => !known.has(`${issue.code}|${issue.file ?? ''}`));
  if (added.length > 0) {
    throw new Error(
      'A operação introduziu novos problemas críticos e o EPUB não foi liberado: ' +
      added.map((issue) => issue.code).join(', '),
    );
  }
}
