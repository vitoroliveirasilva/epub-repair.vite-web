export { inspectEpub } from './validation/validateEpub';
export { repairEpub } from './repair/repairEpub';
export { replaceEpubCover } from './cover/replaceCover';
export { readCoverImageFile, MAX_COVER_IMAGE_SIZE_BYTES } from './cover/coverImageInput';
export { canRepairReport, hasRepairableIssues } from './utils/reportGuards';
export { DEFAULT_REPAIR_OPTIONS, MAX_FILE_SIZE_BYTES } from './utils/constants';
export { makeRepairedFileName } from './utils/fileName';
export type {
  CoverReportInfo,
  CoverReportSource,
  EpubFilePayload,
  ValidationReport,
} from './model/epubTypes';
export type { Issue, Severity } from './model/issueTypes';
export type {
  ManifestItem,
  PackageDocumentInfo,
  PackageMetadata,
  SpineItem,
} from './model/opfTypes';
export type { CoverImageInput, SupportedCoverMediaType } from './cover/coverImageInput';
export type {
  RepairAction,
  RepairOperation,
  RepairOptions,
  RepairResult,
} from './model/repairTypes';
