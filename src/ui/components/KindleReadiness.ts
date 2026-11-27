import type { ValidationReport } from '../../epub';
import { buildKindleChecks, exportKindleReadiness, summarizeKindleChecks } from '../../epub/tools/bookTools';
import { button, downloadBlob, el } from '../dom';

const statusLabels = {
  ready: 'Verificado',
  review: 'Revisar',
  blocked: 'Bloqueado',
} as const;

export function renderKindleReadiness(report: ValidationReport): HTMLElement {
  const checks = buildKindleChecks(report);
  const summary = summarizeKindleChecks(checks);
  const tone = summary.status;
  const headline = summary.blocked
    ? 'Há bloqueios para conferir antes de enviar'
    : summary.review
      ? 'Confira os pontos de atenção para Kindle'
      : 'Nenhum problema detectado nas verificações disponíveis';

  const download = button('Baixar diagnóstico Kindle', 'btn btn-secondary btn-small', () => {
    downloadBlob(new Blob([exportKindleReadiness(report)],
      { type: 'application/json' }), 'diagnostico-kindle.json');
  });

  const details = el('details', { className: 'kindle-readiness-details', children: [
    el('summary', { children: [
      el('span', { text: 'Conferir os ' + checks.length + ' pontos verificados' }),
      el('span', { className: 'kindle-readiness-chevron',
        attrs: { 'aria-hidden': 'true' }, text: '+' }),
    ] }),
    el('div', { className: 'kindle-readiness-expanded', children: [
      el('ul', { className: 'kindle-readiness-list', children: checks.map((check) => {
        return el('li', { className: 'kindle-readiness-item kindle-readiness-item-' + check.status,
          children: [
            el('div', { className: 'kindle-readiness-item-heading', children: [
              el('strong', { text: check.label }),
              el('span', { text: statusLabels[check.status] }),
            ] }),
            el('p', { text: check.detail }),
            !check.ok ? el('small', { text: 'O que conferir: ' + check.action }) : undefined,
          ] });
      }) }),
      el('div', { className: 'kindle-readiness-actions', children: [
        download,
        el('a', { className: 'btn btn-ghost btn-small',
          text: 'Abrir Send to Kindle',
          attrs: {
            href: 'https://www.amazon.com/sendtokindle',
            target: '_blank', rel: 'noopener noreferrer',
          },
        }),
      ] }),
      el('p', { className: 'kindle-readiness-limit',
        text: 'Análise local orientativa. O EPUB pode ser recusado ou exibido de forma diferente no Kindle. Nenhum arquivo é enviado automaticamente.' }),
    ] }),
  ] });

  return el('section', {
    className: 'kindle-readiness-inline kindle-readiness-' + tone,
    attrs: { 'aria-label': 'Compatibilidade Kindle no diagnóstico' },
    children: [
      el('div', { className: 'kindle-readiness-overview', children: [
        el('div', { className: 'kindle-readiness-overview-copy', children: [
          el('span', { className: 'kindle-readiness-kicker',
            text: 'KINDLE / INTEGRADO À VERIFICAÇÃO' }),
          el('h3', { text: 'Conferência para Kindle' }),
          el('p', { text: headline }),
        ] }),
        el('span', { className: 'kindle-readiness-status',
          text: summary.blocked
            ? summary.blocked + ' bloqueio(s)'
            : summary.review ? summary.review + ' para revisar'
              : 'Sem alertas nos critérios verificados',
        }),
      ] }),
      el('div', { className: 'kindle-readiness-counts', children: [
        el('span', { text: summary.ready + ' verificados' }),
        el('span', { text: summary.review + ' para revisar' }),
        el('span', { text: summary.blocked + ' bloqueios' }),
      ] }),
      details,
    ],
  });
}
