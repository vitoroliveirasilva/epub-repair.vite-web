import type { ValidationReport } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';

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
