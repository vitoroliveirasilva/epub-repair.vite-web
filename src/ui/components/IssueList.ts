import type { Issue } from '../../epub';
import { el } from '../dom';

export function renderIssueList(issues: Issue[]): HTMLElement {
  const wrapper = el('section', { className: 'panel issues-panel' });
  wrapper.append(el('h2', { text: 'Problemas encontrados' }));

  if (issues.length === 0) {
    wrapper.append(
      el('p', { className: 'empty success-text', text: 'Nenhum problema crítico encontrado.' }),
    );
    return wrapper;
  }

  for (const [severity, items] of groupBySeverity(issues)) {
    const details = el('details', { className: `issue-group issue-group-${severity}` });
    details.open = severity === 'fatal' || severity === 'error' || issues.length <= 8;
    details.append(
      el('summary', {
        children: [
          el('span', { text: severityLabel(severity) }),
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

function renderIssue(issue: Issue): HTMLElement {
  return el('article', {
    className: `issue issue-${issue.severity}`,
    children: [
      el('div', {
        className: 'issue-title-row',
        children: [
          el('strong', { text: issue.title }),
          el('span', {
            className: issue.repairable ? 'badge badge-repairable' : 'badge',
            text: issue.repairable ? 'corrigível' : 'manual',
          }),
        ],
      }),
      el('div', {
        className: 'issue-meta',
        children: [
          el('code', { text: issue.code }),
          issue.file ? el('code', { text: issue.file }) : undefined,
        ],
      }),
      el('p', { text: issue.detail }),
      issue.context ? el('small', { className: 'muted', text: issue.context }) : undefined,
    ],
  });
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
    fatal: 'Fatais',
    error: 'Erros',
    warning: 'Avisos',
    info: 'Informações',
    success: 'Sucesso',
  };
  return labels[severity];
}
