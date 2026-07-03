import type { RepairResult } from '../../epub';
import { el } from '../dom';

export function renderRepairSummary(result: RepairResult): HTMLElement {
  const before = result.before.stats;
  const after = result.after.stats;
  const root = el('section', { className: 'panel repair-summary' });

  root.append(
    el('div', {
      className: 'section-heading',
      children: [
        el('p', { className: 'eyebrow', text: 'Reparo' }),
        el('h2', { text: 'Alterações aplicadas' }),
        el('p', {
          className: 'muted',
          text: 'Resumo das correções feitas no pacote EPUB com comparação antes e depois',
        }),
      ],
    }),
    el('div', {
      className: 'repair-delta-grid',
      children: [
        renderDeltaCard(
          'Antes',
          before.kindleScore,
          before.fatalCount,
          before.errorCount,
          before.warningCount,
        ),
        renderDeltaCard(
          'Depois',
          after.kindleScore,
          after.fatalCount,
          after.errorCount,
          after.warningCount,
        ),
      ],
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
          el('span', { className: 'action-dot', attrs: { 'aria-hidden': 'true' } }),
          el('div', {
            children: [
              el('strong', { text: action.title }),
              action.file ? el('code', { text: action.file }) : undefined,
              el('p', { text: action.detail }),
            ],
          }),
        ],
      }),
    );
  }
  root.append(list);
  return root;
}

function renderDeltaCard(
  label: string,
  score: number,
  fatal: number,
  error: number,
  warning: number,
): HTMLElement {
  return el('div', {
    className: 'repair-delta-card',
    children: [
      el('small', { text: label }),
      el('strong', { text: `${score}/100` }),
      el('span', { text: `${fatal} fatais • ${error} erros • ${warning} avisos` }),
    ],
  });
}
