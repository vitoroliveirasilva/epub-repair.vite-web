import type { Issue, IssueInput } from '../model/issueTypes';

export function createIssue(input: IssueInput): Issue {
  const stable = [
    input.code,
    input.severity,
    input.file ?? 'global',
    input.title,
    input.detail,
    input.context ?? '',
  ].join('|');
  return {
    ...input,
    id: `${input.code}-${hash(stable)}`,
  };
}

export function dedupeIssues(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = [
      issue.code,
      issue.severity,
      issue.file,
      issue.title,
      issue.detail,
      issue.context,
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function issueSeverityWeight(severity: Issue['severity']): number {
  switch (severity) {
    case 'fatal':
      return 35;
    case 'error':
      return 16;
    case 'warning':
      return 6;
    case 'info':
      return 1;
    case 'success':
      return 0;
  }
}

function hash(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 33) ^ value.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}
