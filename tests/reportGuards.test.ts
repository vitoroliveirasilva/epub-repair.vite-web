import { describe, expect, it } from 'vitest';
import type { ValidationReport } from '../src/epub';
import { canRepairReport, hasRepairableIssues } from '../src/epub';

function report(overrides: Partial<ValidationReport>): ValidationReport {
  return {
    fileName: 'livro.epub',
    fileSize: 1,
    generatedAt: '2026-07-08T00:00:00.000Z',
    validZip: true,
    issues: [],
    zipEntries: [],
    stats: {
      totalFiles: 1,
      fatalCount: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      repairableCount: 0,
      kindleScore: 100,
      structureScore: 100,
      compatibilityScore: 100,
      securityScore: 100,
    },
    ...overrides,
  };
}

describe('reportGuards', () => {
  it('bloqueia reparo quando o EPUB está limpo', () => {
    const cleanReport = report({});

    expect(hasRepairableIssues(cleanReport)).toBe(false);
    expect(canRepairReport(cleanReport)).toBe(false);
  });

  it('libera reparo quando existe problema corrigível não fatal', () => {
    const repairableReport = report({
      issues: [
        {
          id: 'mimetype-missing',
          code: 'MIME_MISSING',
          severity: 'error',
          title: 'mimetype ausente',
          detail: 'O mimetype não foi encontrado.',
          repairable: true,
          file: 'mimetype',
        },
      ],
      stats: {
        totalFiles: 1,
        fatalCount: 0,
        errorCount: 1,
        warningCount: 0,
        infoCount: 0,
        repairableCount: 1,
        kindleScore: 80,
        structureScore: 80,
        compatibilityScore: 100,
        securityScore: 100,
      },
    });

    expect(hasRepairableIssues(repairableReport)).toBe(true);
    expect(canRepairReport(repairableReport)).toBe(true);
  });

  it('não libera reparo quando só existe informação não corrigível', () => {
    const infoReport = report({
      issues: [
        {
          id: 'container-multiple-rootfiles',
          code: 'CONTAINER_MULTIPLE_ROOTFILES',
          severity: 'info',
          title: 'container.xml tem múltiplos rootfiles',
          detail: 'A análise usou o primeiro rootfile válido.',
          repairable: false,
        },
      ],
    });

    expect(canRepairReport(infoReport)).toBe(false);
  });
});
