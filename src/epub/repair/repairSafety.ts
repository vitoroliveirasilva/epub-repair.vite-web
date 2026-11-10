import type { ValidationReport } from '../model/epubTypes';

 
export function assertNoNewCriticalIssues(before: ValidationReport, after: ValidationReport): void {
  if (!after.validZip || after.stats.fatalCount > 0) {
    throw new Error('O EPUB gerado não passou na verificação estrutural final.');
  }
  const relevant = (severity: string): boolean =>
    severity === 'fatal' || severity === 'error' || severity === 'warning';
  
  
  const key = (issue: { code: string; severity: string; file?: string | undefined;
    context?: string | undefined; detail: string }): string =>
    JSON.stringify([issue.code, issue.severity, issue.file ?? '', issue.context ?? '', issue.detail]);
  const previous = new Map<string, number>();
  for (const issue of before.issues.filter((item) => relevant(item.severity))) {
    const identity = key(issue);
    previous.set(identity, (previous.get(identity) ?? 0) + 1);
  }
  const introduced = after.issues.filter((issue) => {
    if (!relevant(issue.severity)) return false;
    const identity = key(issue);
    const available = previous.get(identity) ?? 0;
    if (!available) return true;
    previous.set(identity, available - 1);
    return false;
  });
  if (introduced.length > 0) {
    throw new Error('A operação introduziu novos erros ou avisos: ' +
      introduced.slice(0, 8).map((issue) => issue.code).join(', '));
  }
}
