import { el } from '../dom';

export function renderStatusMessage(message?: string, error?: string): HTMLElement | undefined {
  if (!message && !error) return undefined;
  return el('section', {
    className: error ? 'panel status-panel status-error' : 'panel status-panel status-ok',
    attrs: { role: error ? 'alert' : 'status' },
    children: [
      el('strong', { text: error ? 'Ops, algo deu errado' : 'Status' }),
      el('p', { text: error ?? message ?? '' }),
    ],
  });
}
