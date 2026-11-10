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

describe('Pontuação do EPUB sem pendências com notas puramente informativas', () => {
  const report = (issues: ReturnType<typeof createIssue>[]) => buildValidationReport({
    fileName: 'livro.epub', fileSize: 123, validZip: true, zipEntries: [], issues,
  });

  it('não subtrai ponto por SVG inline meramente informativo, mantendo a nota visível', () => {
    const note = createIssue({
      code: 'CONTENT_INLINE_SVG_LABEL_MISSING',
      severity: 'info',
      title: 'SVG sem rótulo acessível',
      detail: 'SVG pode ser decorativo; exige avaliação editorial.',
      file: 'OPS/Text/titlepage.xhtml',
      repairable: false,
    });
    const result = report([note]);
    expect(result.stats.kindleScore).toBe(100);
    expect(result.stats.structureScore).toBe(100);
    expect(result.stats.compatibilityScore).toBe(100);
    expect(result.stats.securityScore).toBe(100);
    expect(result.stats.infoCount).toBe(1);
    expect(result.stats.repairableCount).toBe(0);
    expect(result.issues).toEqual([note]);
  });

  it('distingue observação editorial de defeito técnico na navegação', () => {
    const note = createIssue({
      code: 'NCX_EDITORIAL_INFERENCE',
      severity: 'info',
      title: 'Divisões inferidas',
      detail: 'Revisão editorial recomendada',
      repairable: false,
      file: 'OPS/toc.ncx',
    });
    const result = report([note]);
    expect(result.stats.infoCount).toBe(1);
    expect(result.stats.warningCount).toBe(0);
    expect(result.stats.kindleScore).toBe(100);
    expect(result.stats.structureScore).toBe(100);
    expect(result.issues).toContain(note);
  });

  it('continua descontando otimizações opcionais informativas e avisos reais', () => {
    const optional = createIssue({
      code: 'IMAGE_PROGRESSIVE_JPEG',
      severity: 'info',
      title: 'JPEG progressivo',
      detail: 'Conversão opcional para baseline',
      repairable: true,
    });
    const warning = createIssue({
      code: 'XHTML_NBSP_ENTITY',
      severity: 'warning',
      title: 'Entidade frágil',
      detail: 'Normalizar NBSP',
      repairable: true,
    });
    const note = createIssue({
      code: 'CONTENT_INLINE_SVG_LABEL_MISSING',
      severity: 'info',
      title: 'SVG sem rótulo',
      detail: 'Revisão editorial possível',
      repairable: false,
    });
    expect(report([optional]).stats.kindleScore).toBe(99);
    expect(report([warning]).stats.kindleScore).toBe(94);
    expect(report([note, warning]).stats.kindleScore).toBe(94);
  });
});
