import type { ValidationReport } from './epubTypes';

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
}

export interface RepairAction {
  type: 'created' | 'updated' | 'removed' | 'normalized' | 'skipped';
  title: string;
  detail: string;
  file?: string | undefined;
}

export interface RepairResult {
  blob: Blob;
  fileName: string;
  before: ValidationReport;
  after: ValidationReport;
  actions: RepairAction[];
  warnings: string[];
}
