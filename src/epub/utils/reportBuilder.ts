import type { CoverReportInfo, ValidationReport, ZipEntryInfo } from '../model/epubTypes';
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
  cover?: CoverReportInfo;
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
    cover: params.cover,
    stats: {
      totalFiles: params.zipEntries.length || params.packageInfo?.manifest.length || 0,
      fatalCount,
      errorCount,
      warningCount,
      infoCount,
      repairableCount,
      kindleScore: clampScore(100 - penalty),
      structureScore: scoreForGroup(issues, isStructureIssue),
      compatibilityScore: scoreForGroup(issues, isCompatibilityIssue),
      securityScore: scoreForGroup(issues, isSecurityIssue),
    },
  };
}

function scoreForGroup(issues: Issue[], predicate: (issue: Issue) => boolean): number {
  const penalty = issues
    .filter(predicate)
    .reduce((total, issue) => total + issueSeverityWeight(issue.severity), 0);
  return clampScore(100 - penalty);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isStructureIssue(issue: Issue): boolean {
  return /^(?:ZIP|MIME|CONTAINER|OPF_(?:MISSING|INVALID|MANIFEST|SPINE|DUPLICATE|BAD_MEDIA|MISSING_RESOURCE|UNSAFE)|NAV_|NCX_(?:MISSING|INVALID)|ORPHAN|SYSTEM)/u.test(
    issue.code,
  );
}

function isCompatibilityIssue(issue: Issue): boolean {
  return /^(?:KINDLE|OPF_(?:LANGUAGE|DATE|PACKAGE|COVER)|NCX_(?:PLAYORDER|SPINE|CONTENT)|XHTML|IMAGE_PROGRESSIVE|CONTENT_KINDLE)/u.test(
    issue.code,
  );
}

function isSecurityIssue(issue: Issue): boolean {
  return /^(?:DRM|ZIP_(?:ENCRYPTED|UNSAFE|NAME_COLLISION)|CONTENT_(?:SCRIPTED|REMOTE|UNSAFE)|CSS_REMOTE)/u.test(
    issue.code,
  );
}
