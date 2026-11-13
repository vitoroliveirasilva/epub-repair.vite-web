import { el } from './dom';

export function renderBrandName(): HTMLElement {
  return el('span', {
    className: 'brand-wordmark',
    children: [
      el('span', { className: 'brand-wordmark-epub', text: 'EPUB' }),
      el('span', { className: 'brand-wordmark-repair', text: 'Repair' }),
    ],
  });
}
