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
          children: [renderReviewDocumentGlyph(), el('span', {
            className: 'status-review-emblem-alert',
            attrs: { 'aria-hidden': 'true' }, text: '!',
          })],
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
          el('span', { className: 'status-highlight-kicker', text: status.kicker }),
          el('strong', { className: 'status-highlight-title', text: status.title }),
          el('p', { className: 'status-highlight-description', text: status.description }),
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
      kind: 'error', kicker: '08 / ERRO',
      title: 'Não foi possível concluir', description: error,
    };
  }

  const text = message ?? '';

  if (/\\b(?:cancelad[ao]s?|interrompid[ao]s?|interrompendo)\\b/iu.test(text)) {
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

  if (/\\b(?:problemas? fatais?|problema fatal|inválido|reparo automático foi bloqueado)\\b/iu.test(text)) {
    return {
      kind: 'blocked', kicker: '07 / REPARO BLOQUEADO',
      title: 'Reparo automático indisponível',
      description: /O novo EPUB tem problemas fatais/iu.test(text)
        ? 'O novo EPUB foi recusado; a cópia anterior continua disponível.'
        : 'O EPUB contém problemas que impedem a correção automática.',
    };
  }

  if (/nenhuma correção é necessária\\.?/iu.test(text) ||
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

  if (/\\b(?:alertas? remanescentes?|fila cheia|pendências?)\\b/iu.test(text)) {
    const queued = /fila cheia/iu.test(text);
    return {
      kind: 'warning', kicker: '04 / ATENÇÃO',
      title: queued ? 'Fila de processamento cheia' : 'Há alertas para conferir',
      description: queued
        ? 'Aguarde ou cancele tarefas agendadas.'
        : 'Alterações aplicadas, mas ainda existem avisos na análise.',
    };
  }

  if (/\\b(?:arquivo carregado|capa carregada|seleção de capa removida|nenhuma alteração automática|nenhum arquivo foi gerado|relatório copiado|melhorias opcionais)\\b/iu.test(text)) {
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
