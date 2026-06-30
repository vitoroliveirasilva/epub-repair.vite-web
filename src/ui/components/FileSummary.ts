import type { ValidationReport } from '../../epub';
import { el, formatBytes } from '../dom';

export function renderFileSummary(report: ValidationReport): HTMLElement {
  const stats = [
    ['Arquivos', String(report.stats.totalFiles), 'neutral'],
    ['Fatais', String(report.stats.fatalCount), 'fatal'],
    ['Erros', String(report.stats.errorCount), 'error'],
    ['Avisos', String(report.stats.warningCount), 'warning'],
    ['Informações', String(report.stats.infoCount), 'info'],
    ['Corrigíveis', String(report.stats.repairableCount), 'success'],
  ];

  const score = renderScore(report.stats.kindleScore);

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
          score,
        ],
      }),
      el('div', {
        className: 'stats-grid',
        children: stats.map(([label, value, tone]) =>
          el('div', {
            className: `stat-card stat-card-${tone}`,
            children: [el('span', { text: value }), el('small', { text: label })],
          }),
        ),
      }),
      renderScoreBar(report.stats.kindleScore),
    ],
  });
}

function renderScore(score: number): HTMLElement {
  const node = el('div', {
    className: scoreClass(score),
    attrs: { 'aria-label': `Compatibilidade estimada Kindle: ${score} de 100` },
    children: [el('span', { text: String(score) })],
  });
  node.style.setProperty('--score-angle', `${score * 3.6}deg`);
  return node;
}

function renderScoreBar(score: number): HTMLElement {
  const fill = el('span', { className: 'score-bar-fill' });
  fill.style.width = `${score}%`;

  return el('div', {
    className: 'score-bar-wrap',
    children: [
      el('div', {
        className: 'score-bar-label',
        children: [
          el('span', { text: 'Compatibilidade estimada' }),
          el('strong', { text: `${score}/100` }),
        ],
      }),
      el('div', { className: 'score-bar', children: [fill] }),
    ],
  });
}

function scoreClass(score: number): string {
  if (score >= 85) return 'score score-good';
  if (score >= 60) return 'score score-mid';
  return 'score score-bad';
}
