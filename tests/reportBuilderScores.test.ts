import { describe, expect, it } from 'vitest';
import { createIssue } from '../src/epub/utils/issueFactory';
import { buildValidationReport } from '../src/epub/utils/reportBuilder';

describe('buildValidationReport score breakdown', () => {
  it('calculates separated structure, compatibility and security scores', () => {
    const report = buildValidationReport({
      fileName: 'Livro.epub',
      fileSize: 123,
      validZip: true,
      zipEntries: [],
      issues: [
        createIssue({
          code: 'OPF_COVER_META_MISSING',
          severity: 'warning',
          title: 'Capa não declarada',
          detail: 'Imagem provável de capa sem meta cover.',
          repairable: true,
        }),
        createIssue({
          code: 'CONTENT_SCRIPTED',
          severity: 'error',
          title: 'Script detectado',
          detail: 'Conteúdo com script.',
          repairable: true,
        }),
      ],
    });

    expect(report.stats.kindleScore).toBeLessThan(100);
    expect(report.stats.compatibilityScore).toBeLessThan(100);
    expect(report.stats.securityScore).toBeLessThan(100);
    expect(report.stats.structureScore).toBe(100);
  });
});
