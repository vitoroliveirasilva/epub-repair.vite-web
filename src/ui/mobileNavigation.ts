import { el } from './dom';

export type MobileNavigationPage = 'repair' | 'converter';

export function renderMobileNavigation(page: MobileNavigationPage): HTMLElement {
  const links = [
    { label: 'Reparar EPUB', href: '/', current: page === 'repair' },
    { label: 'Converter PDF', href: '/converter', current: page === 'converter' },
    ...(page === 'converter'
      ? [
          { label: 'Como funciona', href: '#converter-how', current: false },
          { label: 'Privacidade', href: '#converter-privacy', current: false },
        ]
      : [
          { label: 'Como funciona', href: '#privacy', current: false },
          { label: 'Limitações', href: '#limitations', current: false },
          { label: 'Relatório', href: '#app-workspace', current: false },
        ]),
  ];
  const menu = el('details', {
    className: 'mobile-navigation',
    children: [
      el('summary', {
        className: 'mobile-navigation-trigger',
        attrs: { 'aria-label': 'Menu de navegação' },
        children: [
          el('span', {
            className: 'mobile-navigation-glyph',
            attrs: { 'aria-hidden': 'true' },
            children: [el('i'), el('i'), el('i')],
          }),
          el('span', { className: 'mobile-navigation-label', text: 'Menu' }),
        ],
      }),
      el('nav', {
        className: 'mobile-navigation-panel',
        attrs: { 'aria-label': 'Navegação no celular' },
        children: links.map(({ label, href, current }) =>
          el('a', {
            className: current ? 'mobile-navigation-link mobile-navigation-link-active' : 'mobile-navigation-link',
            text: label,
            attrs: { href, ...(current ? { 'aria-current': 'page' } : {}) },
          })),
      }),
    ],
  });
  menu.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('.mobile-navigation-panel a')) {
      menu.open = false;
    }
  });
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector<HTMLElement>('summary')?.focus();
    }
  });
  return menu;
}
