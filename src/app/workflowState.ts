import type { AppState } from './state';
import { canOptimizeReport, canRepairReport, hasManualReviewIssues } from '../epub';

export type WorkflowState =
  | 'empty'
  | 'loaded'
  | 'processing'
  | 'invalid'
  | 'repairable'
  | 'manual-review'
  | 'optimization'
  | 'ready'
  | 'partial-output'
  | 'completed-output';

/**
 * Estado central do fluxo, baseado sempre no relatório final quando existir
 * cópia gerada. Não confundir EPUB reparado com EPUB livre de ameaças.
 */
export function getWorkflowState(state: AppState): WorkflowState {
  if (state.busy) return 'processing';
  if (state.repairResult?.changed && state.repairResult.blob) {
    return hasManualReviewIssues(state.repairResult.after)
      ? 'partial-output'
      : 'completed-output';
  }
  const report = state.report;
  if (!report) return state.payload ? 'loaded' : 'empty';
  if (!report.validZip || report.stats.fatalCount > 0) return 'invalid';
  if (canRepairReport(report, state.options)) return 'repairable';
  if (hasManualReviewIssues(report)) return 'manual-review';
  if (canOptimizeReport(report) ||
      (state.options.stripImageMetadata &&
       report.issues.some((issue) => issue.code === 'IMAGE_EMBEDDED_METADATA'))) {
    return 'optimization';
  }
  return 'ready';
}
