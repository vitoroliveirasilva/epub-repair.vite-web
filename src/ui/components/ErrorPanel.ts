import { el } from '../dom';

type StatusKind = 'success' | 'verified' | 'review' | 'warning' | 'info' |
  'cancelled' | 'blocked' | 'error';

interface StatusPresentation {
  kind: StatusKind;
  kicker: string;
  title: string;
  description: string;
}

export function renderStatusMessage(message?: string, error?: string): HTMLElement | undefined {
  if (!message && !error) return undefined;
  const status = classifyStatus(message, error);
  const isAlreadyReady = status.kind === 'verified';
  const requiresManualReview = status.kind === 'review';

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
          children: [renderStatusGlyph('review')],
        }),
        el('div', { className: 'status-review-content', children: [
          el('span', { className: 'status-review-kicker', text: status.kicker }),
          el('strong', { className: 'status-review-title', text: status.title }),
          el('p', { className: 'status-review-description', text: status.description }),
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
            el('span', { className: 'status-verified-kicker', text: status.kicker }),
            el('strong', { className: 'status-verified-title', text: status.title }),
            el('p', { className: 'status-verified-description', text: status.description }),
          ],
        }),
      ]
      : [
        el('span', { className: 'status-icon status-highlight-emblem',
          attrs: { 'aria-hidden': 'true' },
          children: [renderStatusGlyph(status.kind)], }),
        el('div', { className: 'status-panel-copy status-highlight-content', children: [
          el('span', { className: 'status-highlight-kicker', text: status.kicker }),
          el('strong', { className: 'status-highlight-title', text: status.title }),
          el('p', { className: 'status-highlight-description', text: status.description }),
        ] }),
      ],
  });
}

function classifyStatus(message?: string, error?: string): StatusPresentation {
  if (error) {
    return {
      kind: 'error', kicker: '08 / ERRO',
      title: 'Não foi possível concluir', description: error,
    };
  }

  const text = message ?? '';

  if (/\b(?:cancelad[ao]s?|interrompid[ao]s?|interrompendo)\b/iu.test(text)) {
    let description = text;
    if (/Nenhum resultado parcial foi publicado/iu.test(text)) {
      description = 'Nenhum resultado parcial foi publicado.';
    } else if (/Troca de capa cancelada/iu.test(text)) {
      description = 'A capa original foi preservada.';
    } else if (/O EPUB original permanece inalterado/iu.test(text)) {
      description = 'O EPUB original foi preservado.';
    }
    return {
      kind: 'cancelled', kicker: '06 / CANCELADO',
      title: 'Operação interrompida', description,
    };
  }

  if (/\b(?:problemas? fatais?|problema fatal|inválido|reparo automático foi bloqueado)\b/iu.test(text)) {
    return {
      kind: 'blocked', kicker: '07 / REPARO BLOQUEADO',
      title: 'Reparo automático indisponível',
      description: /O novo EPUB tem problemas fatais/iu.test(text)
        ? 'O novo EPUB foi recusado; a cópia anterior continua disponível.'
        : 'O EPUB contém problemas que impedem a correção automática.',
    };
  }

  if (/nenhuma correção é necessária\.?/iu.test(text) ||
    /Nenhuma correção obrigatória foi necessária/iu.test(text)) {
    return {
      kind: 'verified', kicker: '02 / VERIFICADO',
      title: 'Seu EPUB está em ordem', description: 'Nenhuma correção é necessária.',
    };
  }

  if (/pendências?.*revisão manual|problemas sem reparo automático/iu.test(text)) {
    const description = /Nada foi alterado/iu.test(text)
      ? 'Nenhuma alteração aplicada; ainda há pendências para revisar.'
      : /Alterações aplicadas/iu.test(text)
        ? 'Alterações aplicadas; restam pendências para revisão manual.'
        : 'Alguns problemas precisam de revisão manual.';
    return {
      kind: 'review', kicker: '03 / REVISÃO MANUAL',
      title: 'Análise concluída com pendências', description,
    };
  }

  if (/\b(?:alertas? remanescentes?|fila cheia|pendências?)\b/iu.test(text)) {
    const queued = /fila cheia/iu.test(text);
    return {
      kind: 'warning', kicker: '04 / ATENÇÃO',
      title: queued ? 'Fila de processamento cheia' : 'Há alertas para conferir',
      description: queued
        ? 'Aguarde ou cancele tarefas agendadas.'
        : 'Alterações aplicadas, mas ainda existem avisos na análise.',
    };
  }

  if (/\b(?:arquivo carregado|capa carregada|seleção de capa removida|nenhuma alteração automática|nenhum arquivo foi gerado|relatório copiado|melhorias opcionais)\b/iu.test(text)) {
    let description = text;
    if (/Arquivo carregado localmente/iu.test(text)) {
      description = 'Arquivo carregado no navegador.';
    } else if (/Nova capa carregada/iu.test(text)) {
      description = 'Nova capa pronta para pré-visualização.';
    } else if (/nenhuma alteração automática/iu.test(text)) {
      description = 'Otimização avaliada; nenhuma alteração foi aplicada.';
    } else if (/relatório copiado/iu.test(text)) {
      description = 'Relatório copiado.';
    } else if (/melhorias opcionais/iu.test(text)) {
      description = 'Sem correções obrigatórias; há melhorias opcionais disponíveis.';
    }
    return {
      kind: 'info', kicker: '05 / INFORMAÇÃO',
      title: 'Atualização registrada', description,
    };
  }

  return {
    kind: 'success', kicker: '01 / SUCESSO',
    title: 'Concluído com sucesso',
    description: /Análise concluída no navegador/iu.test(text)
      ? 'Análise finalizada no navegador.'
      : text,
  };
}

/**
 * Seven distinct, hand-tuned 24px outline glyphs. The verified state keeps its
 * bespoke book illustration in /public/status-verified-book.svg.
 * Shared geometry and stroke weight maintain a consistent visual family.
 */
const STATUS_GLYPH_PATHS: Record<StatusKind, readonly string[]> = {
  success: [
    'M3.85 8.62a4 4 0 0 1 4.77-4.77 4 4 0 0 1 6.76 0 4 4 0 0 1 4.77 4.77 4 4 0 0 1 0 6.76 4 4 0 0 1-4.77 4.77 4 4 0 0 1-6.76 0 4 4 0 0 1-4.77-4.77 4 4 0 0 1 0-6.76Z',
    'm9 12 2 2 4-4',
  ],
  verified: [],
  review: [
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h5',
    'M14 2v6h6',
    'M20 8v3',
    'M18 20.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    'm20.5 20.5 2 2',
  ],
  warning: [
    'M10.3 3.86 1.5 18.66a2 2 0 0 0 1.7 3h17.6a2 2 0 0 0 1.7-3l-8.8-14.8a2 2 0 0 0-3.4 0Z',
    'M12 9v4.5',
    'M12 17.5h.01',
  ],
  info: [
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
    'M12 11v6',
    'M12 7.3h.01',
  ],
  cancelled: [
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
    'M9 9h6v6H9z',
  ],
  blocked: [
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z',
    'M14 2v6h6',
    'M8.7 15h6.6v5H8.7z',
    'M10 15v-1.75a2 2 0 0 1 4 0V15',
  ],
  error: [
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z',
    'M14 2v6h6',
    'm9 13 6 6',
    'm15 13-6 6',
  ],
};

function renderStatusGlyph(kind: StatusKind): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'status-glyph');
  svg.setAttribute('data-status-glyph', kind);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  for (const d of STATUS_GLYPH_PATHS[kind]) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
