import type { ValidationReport, ZipEntryInfo } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { dedupeIssues, issueSeverityWeight } from './issueFactory';

export function buildValidationReport(params: {
  fileName: string;
  fileSize: number;
  validZip: boolean;
  zipEntries: ZipEntryInfo[];
  issues: Issue[];
  packageInfo?: PackageDocumentInfo;
}): ValidationReport {
  const issues = dedupeIssues(params.issues);
  const fatalCount = issues.filter((issue) => issue.severity === 'fatal').length;
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  const infoCount = issues.filter((issue) => issue.severity === 'info').length;
  const repairableCount = issues.filter((issue) => issue.repairable).length;
  const penalty = issues.reduce((total, issue) => total + issueSeverityWeight(issue.severity), 0);

  return {
    fileName: params.fileName,
    fileSize: params.fileSize,
    generatedAt: new Date().toISOString(),
    validZip: params.validZip,
    opfPath: params.packageInfo?.opfPath,
    epubVersion: params.packageInfo?.version,
    issues,
    zipEntries: params.zipEntries,
    packageInfo: params.packageInfo,
    stats: {
      totalFiles: params.zipEntries.length || params.packageInfo?.manifest.length || 0,
      fatalCount,
      errorCount,
      warningCount,
      infoCount,
      repairableCount,
      kindleScore: Math.max(0, Math.min(100, 100 - penalty)),
    },
  };
}
