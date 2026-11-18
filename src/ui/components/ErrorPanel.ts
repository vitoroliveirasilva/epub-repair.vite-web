import { el } from '../dom';

export function renderStatusMessage(message?: string, error?: string): HTMLElement | undefined {
  if (!message && !error) return undefined;
  const isAlreadyReady = !error && message?.includes('nenhuma correção é necessária.') === true;

  return el('section', {
    className: error
      ? 'panel status-panel status-error'
      : `panel status-panel status-ok${isAlreadyReady ? ' status-verified' : ''}`,
    attrs: { role: error ? 'alert' : 'status' },
    children: [
      el('span', { className: 'status-icon', attrs: { 'aria-hidden': 'true' } }),
      el('div', {
        className: 'status-panel-copy',
        children: [
          isAlreadyReady
            ? el('span', { className: 'status-panel-eyebrow', text: 'ANÁLISE FINALIZADA' })
            : undefined,
          el('strong', { text: error ? 'Não foi possível concluir' : 'Concluído com sucesso' }),
          el('p', { text: error ?? message ?? '' }),
        ],
      }),
    ],
  });
}
