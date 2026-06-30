import { DEFAULT_REPAIR_OPTIONS } from '../epub';
import type { EpubFilePayload, RepairOptions, RepairResult, ValidationReport } from '../epub';

export interface AppState {
  payload?: EpubFilePayload | undefined;
  report?: ValidationReport | undefined;
  repairResult?: RepairResult | undefined;
  busy: boolean;
  message?: string | undefined;
  error?: string | undefined;
  options: RepairOptions;
}

export function createInitialState(): AppState {
  return {
    busy: false,
    options: { ...DEFAULT_REPAIR_OPTIONS },
  };
}
