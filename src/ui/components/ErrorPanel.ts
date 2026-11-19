import { el } from '../dom';

type StatusKind = 'success' | 'info' | 'warning' | 'blocked' | 'cancelled' | 'error';

interface StatusPresentation {
  kind: StatusKind;
  kicker: string;
  title: string;
  badge: string;
  nextStep?: string;
}

export function renderStatusMessage(message?: string, error?: string): HTMLElement | undefined {
  if (!message && !error) return undefined;
  const isAlreadyReady = !error && message?.includes('nenhuma correção é necessária.') === true;
  const requiresManualReview = !error && !isAlreadyReady &&
    (/pendências?.*revisão manual/iu.test(message ?? '') ||
      message?.includes('problemas sem reparo automático') === true);
  const status = classifyStatus(message, error);

  return el('section', {
    className: error
      ? 'panel status-panel status-error status-highlight status-highlight-error'
      : isAlreadyReady
        ? 'panel status-panel status-ok status-verified'
        : requiresManualReview
          ? 'panel status-panel status-ok status-review'
          : `panel status-panel status-highlight status-highlight-${status.kind}${status.kind === 'success' ? ' status-ok' : ''}`,
    attrs: { role: error || status.kind === 'blocked' ? 'alert' : 'status' },
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
        el('span', { className: 'status-icon status-highlight-emblem',
          attrs: { 'aria-hidden': 'true' }, children: [
            renderStatusDocumentGlyph(status.kind),
            el('span', { className: 'status-highlight-seal',
              attrs: { 'aria-hidden': 'true' },
              text: status.kind === 'success' ? '✓'
                : status.kind === 'info' ? 'i'
                  : status.kind === 'cancelled' ? '■' : '!',
            }),
          ] }),
        el('div', { className: 'status-panel-copy status-highlight-content', children: [
          el('div', { className: 'status-highlight-heading', children: [
            el('span', { className: 'status-highlight-kicker', text: status.kicker }),
            el('span', { className: 'status-highlight-badge', text: status.badge }),
          ] }),
          el('strong', { className: 'status-highlight-title', text: status.title }),
          el('p', { className: 'status-highlight-description', text: error ?? message ?? '' }),
          status.nextStep
            ? el('span', { className: 'status-highlight-next-step', text: status.nextStep })
            : undefined,
        ] }),
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

function classifyStatus(message?: string, error?: string): StatusPresentation {
  if (error) {
    return {
      kind: 'error', kicker: 'NÃO FOI POSSÍVEL CONCLUIR',
      title: 'Não foi possível concluir', badge: 'Falha na operação',
      nextStep: 'Confira o erro apresentado antes de tentar novamente.',
    };
  }
  const text = message ?? '';
  if (/\b(?:cancelad[ao]s?|interrompid[ao]s?|interrompendo)\b/iu.test(text)) {
    return {
      kind: 'cancelled', kicker: 'OPERAÇÃO INTERROMPIDA',
      title: 'Operação cancelada', badge: 'Sem alterações adicionais',
      nextStep: 'Você pode iniciar outra operação quando quiser.',
    };
  }
  if (/\b(?:problemas? fatais?|problema fatal|inválido|reparo automático foi bloqueado)\b/iu.test(text)) {
    return {
      kind: 'blocked', kicker: 'ARQUIVO REQUER ATENÇÃO',
      title: 'Reparo automático indisponível', badge: 'Verifique o diagnóstico',
      nextStep: 'Confira os problemas apontados antes de prosseguir.',
    };
  }
  if (/\b(?:alertas? remanescentes?|fila cheia|problemas? sem reparo automático|pendências?)\b/iu.test(text)) {
    return {
      kind: 'warning', kicker: 'RESULTADO COM ALERTAS',
      title: 'Conclusão com observações', badge: 'Atenção',
      nextStep: 'Consulte os detalhes da análise antes de usar o arquivo.',
    };
  }
  if (/\b(?:arquivo carregado|capa carregada|seleção de capa removida|nenhuma alteração automática|nenhum arquivo foi gerado)\b/iu.test(text)) {
    return {
      kind: 'info', kicker: 'ATUALIZAÇÃO DO ARQUIVO',
      title: 'Informação registrada', badge: 'Próxima etapa disponível',
    };
  }
  return {
    kind: 'success', kicker: 'OPERAÇÃO CONCLUÍDA',
    title: 'Concluído com sucesso', badge: 'Tudo certo',
    nextStep: /análise concluída/iu.test(text)
      ? 'O diagnóstico completo está disponível nas seções abaixo.'
      : undefined,
  };
}

function renderStatusDocumentGlyph(kind: StatusKind): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 36 36');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.55');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const path of [
    'M10 5h11l6 6v17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
    'M21 5v6h6',
    kind === 'success'
      ? 'M13 20l3 3 6-7'
      : kind === 'error' || kind === 'blocked'
        ? 'M18 16v6m0 3v.1'
        : kind === 'cancelled'
          ? 'M15 18h6v6h-6z'
          : kind === 'warning'
            ? 'M18 16v6m0 3v.1'
            : 'M13 17h10m-10 4h8m-8 4h5',
  ]) {
    const element = document.createElementNS(ns, 'path');
    element.setAttribute('d', path);
    svg.append(element);
  }
  return svg;
}
