import { describe, expect, it } from 'vitest';
import { createIssue, dedupeIssues, issueSeverityWeight } from '../src/epub/utils/issueFactory';

describe('issueFactory', () => {
  it('classifica peso de severidades', () => {
    expect(issueSeverityWeight('fatal')).toBeGreaterThan(issueSeverityWeight('warning'));
    expect(issueSeverityWeight('success')).toBe(0);
  });

  it('remove problemas duplicados', () => {
    const issue = createIssue({
      code: 'MIME_MISSING',
      severity: 'error',
      title: 'mimetype ausente',
      detail: 'faltou',
      file: 'mimetype',
      repairable: true,
    });
    expect(dedupeIssues([issue, issue])).toHaveLength(1);
  });
});
