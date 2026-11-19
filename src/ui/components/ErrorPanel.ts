import { el } from '../dom';

export function renderStatusMessage(message?: string, error?: string): HTMLElement | undefined {
  if (!message && !error) return undefined;
  const isAlreadyReady = !error && message?.includes('nenhuma correção é necessária.') === true;
  const requiresManualReview = !error && !isAlreadyReady &&
    (/pendências?.*revisão manual/iu.test(message ?? '') ||
      message?.includes('problemas sem reparo automático') === true);

  return el('section', {
    className: error
      ? 'panel status-panel status-error'
      : `panel status-panel status-ok${isAlreadyReady ? ' status-verified' :
        requiresManualReview ? ' status-review' : ''}`,
    attrs: { role: error ? 'alert' : 'status' },
    children: requiresManualReview
      ? [
        el('span', { className: 'status-review-emblem',
          attrs: { 'aria-hidden': 'true' },
          children: [renderReviewDocumentGlyph(), el('span', {
            className: 'status-review-emblem-alert',
            attrs: { 'aria-hidden': 'true' }, text: '!',
          })],
        }),
        el('div', { className: 'status-review-content', children: [
          el('div', { className: 'status-review-heading', children: [
            el('span', { className: 'status-review-kicker',
              text: 'DIAGNÓSTICO FINALIZADO' }),
            el('span', { className: 'status-review-badge',
              text: 'Revisão necessária' }),
          ] }),
          el('strong', { className: 'status-review-title',
            text: 'Análise concluída com pendências' }),
          el('p', { className: 'status-review-description', text: message ?? '' }),
          el('span', { className: 'status-review-next-step',
            text: 'Próximo passo: conferir as pendências no relatório.' }),
        ] }),
      ]
      : isAlreadyReady
      ? [
        el('span', {
          className: 'status-verified-seal',
          attrs: { 'aria-hidden': 'true' },
          children: [
            el('img', {
              attrs: {
                src: '/status-verified-book.svg',
                alt: '',
                draggable: 'false',
              },
            }),
          ],
        }),
        el('div', {
          className: 'status-verified-content',
          children: [
            el('span', { className: 'status-verified-kicker', text: 'VERIFICAÇÃO CONCLUÍDA' }),
            el('strong', { className: 'status-verified-title', text: 'Seu EPUB está em ordem.' }),
            el('p', { className: 'status-verified-description', text: message ?? '' }),
            el('span', { className: 'status-verified-footnote', text: 'Arquivo original preservado' }),
          ],
        }),
      ]
      : [
        el('span', { className: 'status-icon', attrs: { 'aria-hidden': 'true' } }),
        el('div', {
          className: 'status-panel-copy',
          children: [
            el('strong', { text: error ? 'Não foi possível concluir' : 'Concluído com sucesso' }),
            el('p', { text: error ?? message ?? '' }),
          ],
        }),
      ],
  });
}

function renderReviewDocumentGlyph(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.55');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const page = document.createElementNS(ns, 'path');
  page.setAttribute('d', 'M9 4.5h11l5 5v17a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-20a2 2 0 0 1 2-2Z');
  const fold = document.createElementNS(ns, 'path');
  fold.setAttribute('d', 'M20 4.5v5h5');
  const lines = document.createElementNS(ns, 'path');
  lines.setAttribute('d', 'M11 15h10m-10 4h7m-7 4h4');
  svg.append(page, fold, lines);
  return svg;
}
