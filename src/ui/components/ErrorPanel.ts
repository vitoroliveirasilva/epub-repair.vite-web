import { el } from '../dom';

export function renderStatusMessage(message?: string, error?: string): HTMLElement | undefined {
  if (!message && !error) return undefined;
  return el('section', {
    className: error ? 'panel status-panel status-error' : 'panel status-panel status-ok',
    attrs: { role: error ? 'alert' : 'status' },
    children: [
      el('span', { className: 'status-icon', attrs: { 'aria-hidden': 'true' } }),
      el('div', {
        children: [
          el('strong', { text: error ? 'Não foi possível concluir' : 'Tudo certo por aqui' }),
          el('p', { text: error ?? message ?? '' }),
        ],
      }),
    ],
  });
}
