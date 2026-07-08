import type { ReportViewMode } from '../../app/state';
import {
  getOptionalOptimizationCount,
  isOptionalOptimizationIssue,
  isRequiredRepairableIssue,
  type Issue,
  type ValidationReport,
} from '../../epub';
import { el } from '../dom';
import { explainIssue } from '../issueExplanations';

export function renderIssueList(
  report: ValidationReport,
  mode: ReportViewMode,
  onModeChange: (mode: ReportViewMode) => void,
): HTMLElement {
  const wrapper = el('section', {
    className: 'panel issues-panel',
    attrs: { 'aria-label': 'Relatório de problemas' },
  });

  wrapper.append(
    el('div', {
      className: 'section-heading section-heading-row',
      children: [
        el('div', {
          children: [
            el('p', {
              className: 'eyebrow',
              text: mode === 'simple' ? 'Resumo' : 'Relatório técnico',
            }),
            el('h2', {
              text: mode === 'simple' ? 'O que precisa da sua atenção' : 'Problemas encontrados',
            }),
          ],
        }),
        renderModeToggle(mode, onModeChange),
      ],
    }),
  );

  if (report.issues.length === 0) {
    wrapper.append(
      el('p', {
        className: 'empty success-text',
        text: 'Nenhum problema crítico encontrado',
      }),
    );
    return wrapper;
  }

  if (mode === 'simple') {
    wrapper.append(renderSimpleReport(report));
    return wrapper;
  }

  for (const [severity, items] of groupBySeverity(report.issues)) {
    const details = el('details', { className: `issue-group issue-group-${severity}` });
    details.open = severity === 'fatal' || severity === 'error' || report.issues.length <= 8;
    details.append(
      el('summary', {
        children: [
          el('span', {
            className: `severity-label severity-label-${severity}`,
            children: [el('i', { attrs: { 'aria-hidden': 'true' } }), severityLabel(severity)],
          }),
          el('small', { text: `${items.length} ocorrência(s)` }),
        ],
      }),
    );

    const list = el('div', { className: 'issue-list' });
    for (const issue of items) list.append(renderIssue(issue));
    details.append(list);
    wrapper.append(details);
  }

  return wrapper;
}

function renderModeToggle(
  mode: ReportViewMode,
  onModeChange: (mode: ReportViewMode) => void,
): HTMLElement {
  const simple = el('button', {
    className:
      mode === 'simple' ? 'mode-toggle-button mode-toggle-button-active' : 'mode-toggle-button',
    text: 'Simples',
    attrs: { type: 'button', 'aria-pressed': String(mode === 'simple') },
  });
  simple.addEventListener('click', () => onModeChange('simple'));

  const technical = el('button', {
    className:
      mode === 'technical' ? 'mode-toggle-button mode-toggle-button-active' : 'mode-toggle-button',
    text: 'Técnico',
    attrs: { type: 'button', 'aria-pressed': String(mode === 'technical') },
  });
  technical.addEventListener('click', () => onModeChange('technical'));

  return el('div', {
    className: 'mode-toggle',
    attrs: { 'aria-label': 'Modo de visualização do relatório' },
    children: [simple, technical],
  });
}

function renderSimpleReport(report: ValidationReport): HTMLElement {
  const highPriority = report.issues.filter((issue) => issue.severity !== 'info').slice(0, 8);
  const visible = highPriority.length > 0 ? highPriority : report.issues.slice(0, 6);

  return el('div', {
    className: 'simple-report',
    children: [
      el('p', {
        className: 'muted',
        text: simpleSummary(report),
      }),
      el('div', {
        className: 'simple-issue-list',
        children: visible.map((issue) => renderSimpleIssue(issue)),
      }),
      report.issues.length > visible.length
        ? el('p', {
            className: 'muted simple-report-more',
            text: `Mais ${report.issues.length - visible.length} ocorrência(s) estão disponíveis no modo técnico`,
          })
        : undefined,
    ],
  });
}

function simpleSummary(report: ValidationReport): string {
  if (report.stats.fatalCount > 0) {
    return 'O EPUB tem problema fatal. O reparo automático foi bloqueado para evitar gerar um arquivo pior que o original.';
  }
  if (report.stats.errorCount > 0 || report.stats.warningCount > 0) {
    return 'Há pontos que podem afetar Kindle ou outros leitores. O reparo automático tenta corrigir somente alterações seguras.';
  }

  const optionalOptimizationCount = getOptionalOptimizationCount(report);
  if (optionalOptimizationCount > 0) {
    return `Não há correções obrigatórias. Há somente ${formatCount(optionalOptimizationCount, 'otimização opcional', 'otimizações opcionais')} de compatibilidade.`;
  }

  return 'Nenhum problema grave encontrado. As informações restantes são apenas notas técnicas.';
}

function renderSimpleIssue(issue: Issue): HTMLElement {
  const explanation = explainIssue(issue);
  return el('article', {
    className: `simple-issue simple-issue-${issue.severity}`,
    children: [
      el('div', {
        className: 'simple-issue-heading',
        children: [
          el('span', { className: `severity-dot severity-dot-${issue.severity}` }),
          el('strong', { text: explanation.title }),
        ],
      }),
      el('p', { text: explanation.message }),
      el('small', {
        className: 'muted',
        text: simpleIssueFooter(issue),
      }),
    ],
  });
}

function simpleIssueFooter(issue: Issue): string {
  if (isOptionalOptimizationIssue(issue)) {
    return 'Use o botão de otimização opcional para tentar aplicar este ajuste';
  }
  if (isRequiredRepairableIssue(issue)) return 'O reparo automático pode tentar resolver';
  return 'Pode exigir revisão manual';
}

function renderIssue(issue: Issue): HTMLElement {
  const repairBadgeText = isOptionalOptimizationIssue(issue)
    ? 'opcional'
    : isRequiredRepairableIssue(issue)
      ? 'corrigível'
      : 'manual';

  return el('article', {
    className: `issue issue-${issue.severity}`,
    children: [
      el('div', {
        className: 'issue-title-row',
        children: [
          el('strong', { text: issue.title }),
          el('span', {
            className:
              repairBadgeText === 'manual' ? 'badge badge-manual' : 'badge badge-repairable',
            text: repairBadgeText,
          }),
        ],
      }),
      el('div', {
        className: 'issue-meta',
        children: [
          el('span', {
            className: `badge badge-${issue.severity}`,
            text: severityLabel(issue.severity),
          }),
          el('code', { text: issue.code }),
          issue.file ? el('code', { text: issue.file }) : undefined,
        ],
      }),
      el('p', { text: issue.detail }),
      issue.context
        ? el('small', { className: 'muted issue-context', text: issue.context })
        : undefined,
    ],
  });
}

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function groupBySeverity(issues: Issue[]): Array<[Issue['severity'], Issue[]]> {
  const order: Issue['severity'][] = ['fatal', 'error', 'warning', 'info', 'success'];
  return order
    .map(
      (severity) =>
        [severity, issues.filter((item) => item.severity === severity)] as [
          Issue['severity'],
          Issue[],
        ],
    )
    .filter(([, items]) => items.length > 0);
}

function severityLabel(severity: Issue['severity']): string {
  const labels: Record<Issue['severity'], string> = {
    fatal: 'Fatal',
    error: 'Erro',
    warning: 'Aviso',
    info: 'Info',
    success: 'Sucesso',
  };
  return labels[severity];
}
