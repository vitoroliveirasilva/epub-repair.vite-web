import { describe, expect, it } from 'vitest';
import type { ValidationReport } from '../src/epub';
import {
  canRepairReport,
  getOptionalOptimizationCount,
  getRequiredRepairableCount,
  hasOptionalOptimizations,
  hasRepairableIssues,
} from '../src/epub';

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
    expect(hasOptionalOptimizations(cleanReport)).toBe(false);
    expect(getRequiredRepairableCount(cleanReport)).toBe(0);
    expect(getOptionalOptimizationCount(cleanReport)).toBe(0);
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
    expect(hasOptionalOptimizations(repairableReport)).toBe(false);
    expect(getRequiredRepairableCount(repairableReport)).toBe(1);
    expect(getOptionalOptimizationCount(repairableReport)).toBe(0);
    expect(canRepairReport(repairableReport)).toBe(true);
  });

  it('trata informação corrigível como otimização opcional, não como reparo obrigatório', () => {
    const optionalReport = report({
      issues: [
        {
          id: 'progressive-jpeg',
          code: 'IMAGE_PROGRESSIVE_JPEG',
          severity: 'info',
          title: 'Há JPEG progressivo no pacote.',
          detail: 'Alguns conversores antigos preferem JPEG baseline.',
          repairable: true,
          file: 'OEBPS/Images/capa.jpg',
        },
      ],
      stats: {
        totalFiles: 1,
        fatalCount: 0,
        errorCount: 0,
        warningCount: 0,
        infoCount: 1,
        repairableCount: 1,
        kindleScore: 99,
        structureScore: 100,
        compatibilityScore: 99,
        securityScore: 100,
      },
    });

    expect(hasRepairableIssues(optionalReport)).toBe(false);
    expect(hasOptionalOptimizations(optionalReport)).toBe(true);
    expect(getRequiredRepairableCount(optionalReport)).toBe(0);
    expect(getOptionalOptimizationCount(optionalReport)).toBe(1);
    expect(canRepairReport(optionalReport)).toBe(false);
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

    expect(hasRepairableIssues(infoReport)).toBe(false);
    expect(hasOptionalOptimizations(infoReport)).toBe(false);
    expect(canRepairReport(infoReport)).toBe(false);
  });
});
