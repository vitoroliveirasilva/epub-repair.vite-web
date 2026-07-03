import type { CoverReportInfo, ValidationReport } from '../../epub';
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
      renderScoreBreakdown(report),
      renderCoverSummary(report.cover),
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

function renderScoreBreakdown(report: ValidationReport): HTMLElement {
  const items = [
    [
      'Estrutura EPUB',
      report.stats.structureScore,
      'ZIP, OCF, OPF, manifest, spine e navegação base.',
    ],
    [
      'Kindle Safe',
      report.stats.compatibilityScore,
      'Metadados, capa, NCX, XHTML e imagens sensíveis ao Kindle.',
    ],
    [
      'Segurança',
      report.stats.securityScore,
      'Scripts, links remotos, caminhos inseguros, DRM ou criptografia.',
    ],
  ] as const;

  return el('div', {
    className: 'score-breakdown',
    children: items.map(([label, scoreValue, description]) =>
      el('article', {
        className: 'score-breakdown-card',
        children: [
          el('div', {
            children: [el('strong', { text: `${scoreValue}/100` }), el('span', { text: label })],
          }),
          el('small', { className: 'muted', text: description }),
        ],
      }),
    ),
  });
}

function renderCoverSummary(cover: CoverReportInfo | undefined): HTMLElement {
  const declared = cover?.declared ?? false;
  const exists = cover?.exists ?? false;
  const tone = declared && exists ? 'success' : exists ? 'warning' : 'info';

  return el('article', {
    className: `cover-summary cover-summary-${tone}`,
    children: [
      renderCoverPreview(cover),
      el('div', {
        className: 'cover-summary-content',
        children: [
          el('p', { className: 'eyebrow', text: 'Capa' }),
          el('h3', { text: coverTitle(cover) }),
          el('p', {
            className: 'muted',
            text: cover?.note ?? 'Nenhuma informação de capa disponível.',
          }),
          el('div', {
            className: 'cover-summary-meta',
            children: [
              el('span', {
                className: `badge badge-${tone}`,
                text: declared ? 'declarada' : exists ? 'detectada' : 'não detectada',
              }),
              cover?.path ? el('code', { text: cover.path }) : undefined,
              cover?.mediaType ? el('code', { text: cover.mediaType }) : undefined,
            ],
          }),
        ],
      }),
    ],
  });
}

function renderCoverPreview(cover: CoverReportInfo | undefined): HTMLElement {
  if (cover?.previewDataUrl) {
    return el('figure', {
      className: 'cover-preview',
      children: [
        el('img', {
          attrs: {
            src: cover.previewDataUrl,
            alt: cover.path
              ? `Prévia da capa detectada: ${cover.path}`
              : 'Prévia da capa detectada',
            loading: 'lazy',
            decoding: 'async',
          },
        }),
      ],
    });
  }

  return el('div', {
    className: 'cover-preview cover-preview-empty',
    attrs: { 'aria-hidden': 'true' },
    children: [el('span'), el('small', { text: 'Sem prévia' })],
  });
}

function coverTitle(cover: CoverReportInfo | undefined): string {
  if (!cover || cover.source === 'none') return 'Capa não detectada com segurança';
  if (cover.declared) return 'Capa oficial declarada no OPF';
  return 'Imagem provável de capa encontrada';
}

function scoreClass(score: number): string {
  if (score >= 85) return 'score score-good';
  if (score >= 60) return 'score score-mid';
  return 'score score-bad';
}
