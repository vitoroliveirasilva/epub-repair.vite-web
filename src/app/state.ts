import { DEFAULT_REPAIR_OPTIONS } from '../epub';
import type {
  CoverImageInput,
  EpubFilePayload,
  RepairOptions,
  RepairResult,
  ValidationReport,
} from '../epub';

export type ReportViewMode = 'simple' | 'technical';

export interface AppState {
  payload?: EpubFilePayload | undefined;
  report?: ValidationReport | undefined;
  repairResult?: RepairResult | undefined;
  coverImage?: CoverImageInput | undefined;
  busy: boolean;
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
