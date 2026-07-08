import {
  getOptionalOptimizationCount,
  getRequiredRepairableCount,
  type RepairResult,
} from '../../epub';
import { el } from '../dom';

export function renderRepairSummary(result: RepairResult): HTMLElement {
  const before = result.before.stats;
  const after = result.after.stats;
  const root = el('section', { className: 'panel repair-summary' });
  const isCoverReplacement = result.operation === 'cover-replacement';

  root.append(
    el('div', {
      className: 'section-heading',
      children: [
        el('p', { className: 'eyebrow', text: resultEyebrow(result) }),
        el('h2', { text: resultTitle(result) }),
        el('p', { className: 'muted', text: resultDescription(result) }),
      ],
    }),
    isCoverReplacement
      ? renderCoverResultGrid(result)
      : el('div', {
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

  for (const warning of result.warnings) {
    root.append(el('p', { className: 'muted repair-warning', text: warning }));
  }

  if (!result.changed || result.actions.length === 0) {
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

function resultEyebrow(result: RepairResult): string {
  if (result.operation === 'cover-replacement') return 'Capa';
  if (result.operation === 'optimization') return 'Otimização';
  return 'Reparo';
}

function resultTitle(result: RepairResult): string {
  if (result.operation === 'cover-replacement') return 'Capa aplicada';
  if (result.operation === 'optimization') return 'Otimização aplicada';
  return 'Alterações aplicadas';
}

function resultDescription(result: RepairResult): string {
  if (result.operation === 'cover-replacement') {
    return 'Resumo da troca de capa feita no pacote EPUB com validação final';
  }
  if (result.operation === 'optimization') {
    return 'Resumo das melhorias opcionais aplicadas no pacote EPUB com comparação antes e depois';
  }
  return 'Resumo das correções feitas no pacote EPUB com comparação antes e depois';
}

function renderCoverResultGrid(result: RepairResult): HTMLElement {
  const after = result.after.stats;
  const requiredRepairableCount = getRequiredRepairableCount(result.after);
  const optionalOptimizationCount = getOptionalOptimizationCount(result.after);

  return el('div', {
    className: 'repair-delta-grid',
    children: [
      renderMetricCard(
        'Validação final',
        `${after.kindleScore}/100`,
        `${after.fatalCount} fatais • ${after.errorCount} erros • ${after.warningCount} avisos`,
      ),
      renderMetricCard(
        'Reparos obrigatórios',
        String(requiredRepairableCount),
        requiredRepairableCount > 0
          ? 'Ainda há correções técnicas disponíveis'
          : 'Nenhum reparo obrigatório pendente',
      ),
      renderMetricCard(
        'Otimizações opcionais',
        String(optionalOptimizationCount),
        optionalOptimizationCount > 0
          ? 'Melhorias de compatibilidade ainda disponíveis'
          : 'Nenhuma otimização opcional pendente',
      ),
    ],
  });
}

function renderMetricCard(label: string, value: string, detail: string): HTMLElement {
  return el('div', {
    className: 'repair-delta-card',
    children: [
      el('small', { text: label }),
      el('strong', { text: value }),
      el('span', { text: detail }),
    ],
  });
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
