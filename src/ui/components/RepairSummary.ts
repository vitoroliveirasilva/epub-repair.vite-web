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

  if (result.fileDiffs?.length) root.append(renderTextChanges(result.fileDiffs));

  for (const warning of result.warnings) {
    root.append(el('p', { className: 'muted repair-warning', text: warning }));
  }

  root.append(renderResidualIssues(result));

  if (!result.changed) {
    root.append(el('p', {
      className: 'muted',
      text: 'Nenhum arquivo foi gerado. Confira as ações não aplicadas abaixo.',
    }));
  }
  if (result.actions.length === 0) {
    root.append(el('p', { className: 'empty', text: 'Nenhuma ação registrada.' }));
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
  if (!result.changed) return 'Avaliação concluída sem alterações';
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

function renderTextChanges(diffs: NonNullable<RepairResult['fileDiffs']>): HTMLElement {
  const details = el('details', {
    className: 'repair-file-diffs',
    attrs: { 'aria-label': 'Diferenças de arquivos de texto antes e depois' },
  });
  details.append(el('summary', {
    text: 'Comparar texto técnico antes/depois (' + diffs.length + ' arquivo(s))',
  }));
  for (const diff of diffs) {
    const item = el('details', { className: 'repair-file-diff' });
    item.append(
      el('summary', { text: diff.path + ' (' + diff.kind + ')' }),
      el('small', { className: 'muted', text:
        'Linhas: ' + diff.beforeLines + ' → ' + diff.afterLines +
        (diff.truncated ? ' · prévia limitada' : '') }),
      el('pre', { className: 'repair-diff-preview', text: diff.preview }),
    );
    details.append(item);
  }
  return details;
}


function renderResidualIssues(result: RepairResult): HTMLElement {
  const issues = result.after.issues.filter((item) =>
    item.severity === 'fatal' || item.severity === 'error' || item.severity === 'warning');
  const skipped = result.actions.filter((action) => action.type === 'skipped');
  const manualCount = issues.filter((issue) => !issue.repairable).length;
  const details = el('details', {
    className: 'repair-pending-issues',
    attrs: { 'aria-label': 'Ações não aplicadas e problemas remanescentes' },
  });
  details.open = manualCount > 0 && issues.length + skipped.length <= 10;
  details.append(el('summary', {
    children: [
      el('span', {
        className: 'repair-pending-heading',
        children: [
          el('strong', { text: manualCount > 0 ? 'Conferência manual necessária' : 'Conferência do resultado' }),
          el('small', { text: 'Pendências restantes: ' + issues.length +
            ' · ações não aplicadas: ' + skipped.length }),
        ],
      }),
      manualCount > 0 ? el('span', {
        className: 'repair-pending-count badge badge-manual',
        text: `${manualCount} ${manualCount === 1 ? 'manual' : 'manuais'}`,
      }) : undefined,
    ],
  }));
  const list = el('ul', { className: 'repair-pending-list' });
  for (const issue of issues) {
    list.append(el('li', {
      className: `repair-pending-item repair-pending-item-${issue.severity}`,
      children: [
        el('div', { className: 'repair-pending-item-heading', children: [
          el('strong', { text: issue.title }),
          el('span', {
            className: issue.repairable ? 'badge badge-repairable' : 'badge badge-manual',
            text: issue.repairable ? 'Correção automática possível' : 'Exige revisão manual',
          }),
        ] }),
        el('div', { className: 'repair-pending-item-meta', children: [
          el('code', { text: issue.code }),
          issue.file ? el('code', { text: issue.file }) : undefined,
        ] }),
        el('p', { text: issue.detail }),
        issue.context
          ? el('small', { className: 'repair-pending-context', text: issue.context })
          : undefined,
      ],
    }));
  }
  for (const action of skipped) {
    list.append(el('li', {
      className: 'repair-pending-item repair-pending-item-skipped',
      children: [
        el('strong', { text: 'Não aplicado: ' + action.title }),
        action.file ? el('code', { text: action.file }) : undefined,
        el('p', { text: action.detail }),
      ],
    }));
  }
  if (issues.length === 0 && skipped.length === 0) {
    list.append(el('li', {
      className: 'repair-pending-item repair-pending-item-empty',
      text: 'Nenhum problema pendente ou ação pulada no relatório final.',
    }));
  }
  details.append(list);
  return details;
}
