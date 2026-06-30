import type { RepairResult } from '../../epub';
import { el } from '../dom';

export function renderRepairSummary(result: RepairResult): HTMLElement {
  const before = result.before.stats;
  const after = result.after.stats;
  const root = el('section', { className: 'panel repair-summary' });

  root.append(
    el('p', { className: 'eyebrow', text: 'Reparo' }),
    el('h2', { text: 'Alterações aplicadas' }),
    el('p', {
      className: 'muted',
      text: `Antes: ${before.fatalCount} fatais, ${before.errorCount} erros, ${before.warningCount} avisos, score ${before.kindleScore}. Depois: ${after.fatalCount} fatais, ${after.errorCount} erros, ${after.warningCount} avisos, score ${after.kindleScore}.`,
    }),
  );

  if (result.actions.length === 0) {
    root.append(el('p', { className: 'empty', text: 'Nada precisou ser alterado.' }));
    return root;
  }

  const list = el('ol', { className: 'action-list' });
  for (const action of result.actions) {
    list.append(
      el('li', {
        className: `action action-${action.type}`,
        children: [
          el('strong', { text: action.title }),
          action.file ? el('code', { text: action.file }) : undefined,
          el('p', { text: action.detail }),
        ],
      }),
    );
  }
  root.append(list);
  return root;
}
