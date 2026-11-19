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
          children: [renderStatusGlyph('verified')],
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
 * A restrained eight-symbol editorial family, with no floating corner badges.
 * All glyphs use identical proportions, line caps and a shared 32px grid.
 * The verified book uses a single integrated checkmark rather than an
 * illustration, and the remaining states use distinct silhouettes.
 */
const STATUS_GLYPH_PATHS: Record<StatusKind, readonly string[]> = {
  success: [
    'M16 4a12 12 0 1 1 0 24 12 12 0 0 1 0-24Z',
    'M9.8 16.15l4.25 4.3 8.3-8.8',
  ],
  verified: [
    'M4.2 7.7c4.1-1.8 7.7-1.45 11.8 1 4.1-2.45 7.7-2.8 11.8-1v17.1c-4.1-1.8-7.7-1.45-11.8 1-4.1-2.45-7.7-2.8-11.8-1V7.7Z',
    'M16 8.7v17.1',
    'M8.4 12.8c1.25-.35 2.65-.18 4 .52',
    'M19.1 17.6l2.2 2.15 4.6-4.9',
  ],
  review: [
    'M18.6 5.4H9a2.1 2.1 0 0 0-2.1 2.1v17A2.1 2.1 0 0 0 9 26.6h4.7',
    'M18.6 5.4v5.4H24',
    'M24 10.8v2.7',
    'M10.2 13.9h6.1',
    'M10.2 18h3.1',
    'm14.7 23.6 8.3-8.3a1.6 1.6 0 0 1 2.3 0l1.2 1.2a1.6 1.6 0 0 1 0 2.3l-8.3 8.3-4.6 1.2 1.1-4.7Z',
    'm21.6 16.7 3 3',
  ],
  warning: [
    'M13.3 5.8a3.1 3.1 0 0 1 5.4 0l10.3 17.5a2.35 2.35 0 0 1-2 3.5H5a2.35 2.35 0 0 1-2-3.5L13.3 5.8Z',
    'M16 12.6v6.2',
    'M16 22.7h.01',
  ],
  info: [
    'M16 4a12 12 0 1 1 0 24 12 12 0 0 1 0-24Z',
    'M16 14.1v7.2',
    'M16 9.7h.01',
  ],
  cancelled: [
    'M16 4a12 12 0 1 1 0 24 12 12 0 0 1 0-24Z',
    'M12.4 11.6v8.8',
    'M19.6 11.6v8.8',
  ],
  blocked: [
    'M16 3.6c4 2.8 7.4 3.4 10.6 4.1v7.6c0 6.3-4.05 10.5-10.6 13.1C9.45 25.8 5.4 21.6 5.4 15.3V7.7C8.6 7 12 6.4 16 3.6Z',
    'M12.6 15.7v-2.4a3.4 3.4 0 1 1 6.8 0v2.4',
    'M11.5 15.7h9v7.2h-9z',
    'M16 18.5v1.5',
  ],
  error: [
    'M10.9 4.2h10.2l6.7 6.7v10.2l-6.7 6.7H10.9l-6.7-6.7V10.9l6.7-6.7Z',
    'M12.1 12.1l7.8 7.8',
    'M19.9 12.1l-7.8 7.8',
  ],
};

function renderStatusGlyph(kind: StatusKind): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'status-glyph');
  svg.setAttribute('data-status-glyph', kind);
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
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
