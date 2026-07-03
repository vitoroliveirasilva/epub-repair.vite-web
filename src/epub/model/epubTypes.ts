import type JSZip from 'jszip';
import type { Issue } from './issueTypes';
import type { PackageDocumentInfo } from './opfTypes';

export interface ZipEntryInfo {
  fileName: string;
  compressionMethod: number;
  encrypted: boolean;
  localHeaderOffset: number;
  compressedSize: number;
  uncompressedSize: number;
  extraFieldLength: number;
  isDirectory: boolean;
}

export interface EpubEntry {
  path: string;
  bytes: Uint8Array;
  directory: boolean;
  unsafeOriginalName?: string | undefined;
}

export interface LoadedEpub {
  fileName: string;
  fileSize: number;
  bytes: Uint8Array;
  zip?: JSZip | undefined;
  rawEntries: ZipEntryInfo[];
  files: Map<string, EpubEntry>;
  fileNames: string[];
  issues: Issue[];
  validZip: boolean;
}

export interface ReportStats {
  totalFiles: number;
  fatalCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  repairableCount: number;
  kindleScore: number;
  structureScore: number;
  compatibilityScore: number;
  securityScore: number;
}

export type CoverReportSource = 'opf-meta' | 'cover-image-property' | 'candidate' | 'none';

export interface CoverReportInfo {
  declared: boolean;
  exists: boolean;
  source: CoverReportSource;
  path?: string | undefined;
  mediaType?: string | undefined;
  note?: string | undefined;
  previewDataUrl?: string | undefined;
}

export interface ValidationReport {
  fileName: string;
  fileSize: number;
  generatedAt: string;
  validZip: boolean;
  opfPath?: string | undefined;
  epubVersion?: string | undefined;
  issues: Issue[];
  zipEntries: ZipEntryInfo[];
  packageInfo?: PackageDocumentInfo | undefined;
  cover?: CoverReportInfo | undefined;
  stats: ReportStats;
}

export interface EpubFilePayload {
  file: File;
  bytes: Uint8Array;
}
