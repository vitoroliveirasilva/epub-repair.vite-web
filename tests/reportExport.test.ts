import { describe, expect, it } from 'vitest';
import type { ValidationReport } from '../src/epub';
import { buildJsonReport, buildTextReport, createReportEvidence, makeReportFileName } from '../src/ui/copyReport';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';

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
  it('E-084: versão, opções e SHA-256 verificável no relatório TXT/JSON', async () => {
    const evidence = await createReportEvidence(
      'livro.epub', new TextEncoder().encode('abc'), DEFAULT_REPAIR_OPTIONS,
    );
    expect(evidence.appVersion).toBe('2.2.0');
    expect(evidence.sourceFileName).toBe('livro.epub');
    expect(evidence.sourceSha256).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const text = buildTextReport(report, undefined, evidence);
    expect(text).toContain('SHA-256 do arquivo carregado');
    expect(text).toContain(evidence.sourceSha256);
    expect(text).toContain('podem diferir das usadas no reparo');
    const json = JSON.parse(buildJsonReport(report, undefined, evidence)) as {
      evidence: typeof evidence;
    };
    expect(json.evidence.sourceSha256).toBe(evidence.sourceSha256);
    expect(json.evidence.selectedOptions.repairManifest).toBe(true);
  });

  it('E-084: opções usadas permanecem congeladas mesmo se usuário altera as atuais', async () => {
    const used = { ...DEFAULT_REPAIR_OPTIONS };
    const current = { ...used, removeRemoteResourceLinks: true };
    const evidence = await createReportEvidence('original.epub',
      new TextEncoder().encode('livro original'), current, used);
    used.sanitizeScripts = false;
    expect(evidence.appliedRepairOptions?.sanitizeScripts).toBe(true);
    expect(evidence.selectedOptions.removeRemoteResourceLinks).toBe(true);
    expect(evidence.appliedRepairOptions?.removeRemoteResourceLinks).toBe(false);
    const reportText = buildTextReport(report, undefined, evidence);
    expect(reportText).toContain('Opções efetivamente usadas no último reparo');
    const json = JSON.parse(buildJsonReport(report, undefined, evidence)) as {
      evidence: typeof evidence;
    };
    expect(json.evidence.sourceFileName).toBe('original.epub');
  });

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
