import { DEFAULT_REPAIR_OPTIONS } from '../epub';
import type {
  CoverImageInput,
  EpubFilePayload,
  RepairOptions,
  RepairResult,
  ValidationReport,
} from '../epub';

export type ReportViewMode = 'simple' | 'technical';

export interface ProcessingProgress {
  phase: string;
  completed?: number | undefined;
  total?: number | undefined;
}

export interface AppState {
  payload?: EpubFilePayload | undefined;
  originalSource?: { fileName: string; bytes: Uint8Array } | undefined;
  lastRepairOptions?: RepairOptions | undefined;
  report?: ValidationReport | undefined;
  repairResult?: RepairResult | undefined;
  coverImage?: CoverImageInput | undefined;
  busy: boolean;
  /** O usuário pode interromper o Worker que extrai entradas ZIP. */
  processingController?: AbortController | undefined;
  processingProgress?: ProcessingProgress | undefined;
  message?: string | undefined;
  error?: string | undefined;
  options: RepairOptions;
  reportViewMode: ReportViewMode;
}

export function createInitialState(): AppState {
  return {
    busy: false,
    options: { ...DEFAULT_REPAIR_OPTIONS },
    reportViewMode: 'simple',
  };
}
