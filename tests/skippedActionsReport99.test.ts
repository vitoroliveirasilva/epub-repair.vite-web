// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderRepairSummary } from '../src/ui/components/RepairSummary';
import type { RepairResult } from '../src/epub/model/repairTypes';
import type { ValidationReport } from '../src/epub/model/epubTypes';

const statistics = {
  fatalCount: 0, errorCount: 0, warningCount: 1, infoCount: 0, repairableCount: 0,
  kindleScore: 94, structureScore: 100, compatibilityScore: 94, securityScore: 100, totalFiles: 4,
};
const report = { stats: statistics, issues: [] } as unknown as ValidationReport;

describe('E-079: ações puladas sempre aparecem no relatório', () => {
  it('mostra por que o reparo não foi aplicado mesmo sem arquivo para baixar', () => {
    const result: RepairResult = {
      fileName: 'livro.epub', before: report, after: report, changed: false,
      operation: 'repair', warnings: ['O arquivo não pode ser alterado automaticamente.'],
      actions: [{
        type: 'skipped', title: 'ID duplicado exige revisão manual',
        detail: 'Referência ambígua', file: 'OPS/book.opf',
      }],
    };
    const ui = renderRepairSummary(result);
    expect(ui.querySelectorAll('.action-skipped')).toHaveLength(1);
    expect(ui.textContent).toContain('ID duplicado exige revisão manual');
    expect(ui.textContent).toContain('Nenhum arquivo foi gerado');
  });
});
