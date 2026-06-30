import type { ValidationReport } from '../../epub';
import { el, formatBytes } from '../dom';

export function renderFileSummary(report: ValidationReport): HTMLElement {
  const stats = [
    ['Arquivos', String(report.stats.totalFiles)],
    ['Fatais', String(report.stats.fatalCount)],
    ['Erros', String(report.stats.errorCount)],
    ['Avisos', String(report.stats.warningCount)],
    ['Corrigíveis', String(report.stats.repairableCount)],
  ];

  return el('section', {
    className: 'panel report-panel',
    attrs: { 'aria-label': 'Resumo do EPUB' },
    children: [
      el('div', {
        className: 'report-heading',
        children: [
          el('div', {
            children: [
              el('p', { className: 'eyebrow', text: 'Diagnóstico' }),
              el('h2', { text: report.fileName }),
              el('p', {
                className: 'muted',
                text: `${formatBytes(report.fileSize)} • ${report.epubVersion ? `EPUB ${report.epubVersion}` : 'Versão não identificada'} • ${report.opfPath ?? 'OPF não encontrado'}`,
              }),
            ],
          }),
          el('div', {
            className: scoreClass(report.stats.kindleScore),
            children: [
              el('span', { text: String(report.stats.kindleScore) }),
              el('small', { text: 'Kindle score' }),
            ],
          }),
        ],
      }),
      el('div', {
        className: 'stats-grid',
        children: stats.map(([label, value]) =>
          el('div', {
            className: 'stat-card',
            children: [el('span', { text: value }), el('small', { text: label })],
          }),
        ),
      }),
    ],
  });
}

function scoreClass(score: number): string {
  if (score >= 85) return 'score score-good';
  if (score >= 60) return 'score score-mid';
  return 'score score-bad';
}
