import { describe, expect, it } from 'vitest';
import type { ValidationReport } from '../src/epub';
import { buildJsonReport, buildTextReport, makeReportFileName } from '../src/ui/copyReport';

const report: ValidationReport = {
  fileName: 'Livro Teste.epub',
  fileSize: 10,
  generatedAt: '2026-07-02T00:00:00.000Z',
  validZip: true,
  issues: [],
  zipEntries: [],
  cover: {
    declared: true,
    exists: true,
    source: 'opf-meta',
    path: 'OEBPS/Images/cover.jpg',
    mediaType: 'image/jpeg',
  },
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
};

describe('report export helpers', () => {
  it('exports text report with score breakdown and cover status', () => {
    const text = buildTextReport(report);

    expect(text).toContain('Score estrutura: 100');
    expect(text).toContain('Score compatibilidade: 100');
    expect(text).toContain('OEBPS/Images/cover.jpg');
  });

  it('exports serializable JSON report', () => {
    const json = JSON.parse(buildJsonReport(report)) as { report: ValidationReport };

    expect(json.report.fileName).toBe('Livro Teste.epub');
    expect(json.report.cover?.declared).toBe(true);
  });

  it('creates safe report file names', () => {
    expect(makeReportFileName('Livro Teste.epub', 'json')).toBe('Livro-Teste-relatorio.json');
  });
});
