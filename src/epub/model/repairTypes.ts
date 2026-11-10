import type { ValidationReport } from './epubTypes';
import type { TextFileDiff } from '../repair/textFileDiff';

export interface RepairOptions {
  kindleSafeMode: boolean;
  conservativeMode: boolean;
  stripSystemFiles: boolean;
  normalizeMimetype: boolean;
  rebuildContainer: boolean;
  repairManifest: boolean;
  repairSpine: boolean;
  generateNavigation: boolean;
  generateNcx: boolean;
  sanitizeScripts: boolean;
  removeRemoteResourceLinks: boolean;
  repairCssReferences: boolean;
   
  replaceMissingImagesWithText: boolean;
   
  stripImageMetadata?: boolean | undefined;
}

export interface RepairAction {
  type: 'created' | 'updated' | 'removed' | 'normalized' | 'skipped';
  title: string;
  detail: string;
  file?: string | undefined;
}

export type RepairOperation = 'repair' | 'optimization' | 'cover-replacement';

export interface RepairResult {
  blob?: Blob | undefined;
  fileName: string;
  before: ValidationReport;
  after: ValidationReport;
  actions: RepairAction[];
   
  fileDiffs?: TextFileDiff[] | undefined;
  warnings: string[];
  changed: boolean;
  operation: RepairOperation;
}
