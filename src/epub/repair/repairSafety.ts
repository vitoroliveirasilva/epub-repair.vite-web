import type { ValidationReport } from '../model/epubTypes';

/** Impede regressões introduzidas pelo reparo, inclusive novos avisos de navegação. */
export function assertNoNewCriticalIssues(before: ValidationReport, after: ValidationReport): void {
  if (!after.validZip || after.stats.fatalCount > 0) {
    throw new Error('O EPUB gerado não passou na verificação estrutural final.');
  }
  const relevant = (severity: string): boolean =>
    severity === 'fatal' || severity === 'error' || severity === 'warning';
  const key = (issue: { code: string; file?: string | undefined; context?: string | undefined }): string =>
    `${issue.code}|${issue.file ?? ''}|${issue.context ?? ''}`;
  const previous = new Set(before.issues.filter((issue) => relevant(issue.severity)).map(key));
  const introduced = after.issues.filter((issue) =>
    relevant(issue.severity) && !previous.has(key(issue)),
  );
  if (introduced.length > 0) {
    throw new Error('A operação introduziu novos erros ou avisos: ' +
      introduced.slice(0, 8).map((issue) => issue.code).join(', '));
  }
}
