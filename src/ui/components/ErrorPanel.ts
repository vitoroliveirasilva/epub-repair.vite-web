import { el } from '../dom';

export function renderStatusMessage(message?: string, error?: string): HTMLElement | undefined {
  if (!message && !error) return undefined;
  const isAlreadyReady = !error && message?.includes('nenhuma correção é necessária.') === true;

  return el('section', {
    className: error
      ? 'panel status-panel status-error'
      : `panel status-panel status-ok${isAlreadyReady ? ' status-verified' : ''}`,
    attrs: { role: error ? 'alert' : 'status' },
    children: isAlreadyReady
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
