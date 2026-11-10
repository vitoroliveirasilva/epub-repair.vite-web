
import { describe, expect, it } from 'vitest';
import { renderRepairSummary } from '../src/ui/components/RepairSummary';
import type { RepairResult } from '../src/epub/model/repairTypes';
import type { ValidationReport } from '../src/epub/model/epubTypes';

function report(issues: Array<{ code: string; severity: string; repairable: boolean; file?: string }>) {
  return { stats: { kindleScore: 85, fatalCount: 0, errorCount: 0, warningCount: 2,
    infoCount: 0, repairableCount: 0 }, issues } as unknown as ValidationReport;
}
describe('E-079: resultado discrimina pendências e tarefas não aplicadas', () => {
  it('lista cada problema residual e qual exige revisão manual', () => {
    const after = report([{
      code: 'CONTENT_SCRIPTED', severity: 'warning', repairable: false,
      file: 'OPS/chapter.xhtml',
    }]);
    const result = {
      fileName: 'book.epub', before: after, after, operation: 'repair',
      changed: true, warnings: [], actions: [{
        type: 'skipped', title: 'Ação bloqueada', detail: 'XML inválido',
        file: 'OPS/chapter.xhtml',
      }],
    } as RepairResult;
    const ui = renderRepairSummary(result);
    const pending = ui.querySelector('.repair-pending-issues')!;
    expect(pending.textContent).toContain('Pendências restantes: 1');
    expect(pending.textContent).toContain('ações não aplicadas: 1');
    expect(pending.textContent).toContain('CONTENT_SCRIPTED');
    expect(pending.textContent).toContain('Exige revisão manual');
    expect(pending.textContent).toContain('Não aplicado: Ação bloqueada');
  });
  it('apresenta ausência de pendências sem inventar ações aplicadas', () => {
    const after = report([]);
    const result = {
      fileName: 'book.epub', before: after, after, operation: 'repair',
      changed: false, warnings: [], actions: [],
    } as RepairResult;
    const ui = renderRepairSummary(result);
    expect(ui.querySelector('.repair-pending-issues')?.textContent)
      .toContain('Nenhum problema pendente');
  });
});
