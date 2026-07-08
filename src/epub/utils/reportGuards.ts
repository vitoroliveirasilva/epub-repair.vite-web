import type { ValidationReport } from '../model/epubTypes';

export function hasRepairableIssues(report: ValidationReport | undefined): boolean {
  return Boolean(
    report?.issues.some(
      (issue) => issue.repairable && issue.severity !== 'info' && issue.severity !== 'success',
    ),
  );
}

export function canRepairReport(report: ValidationReport | undefined): boolean {
  return Boolean(report?.validZip && report.stats.fatalCount === 0 && hasRepairableIssues(report));
}
