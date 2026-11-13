import { el } from './dom';
import { renderBrandName } from './brand';

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
  const openButton = el('button', {
    className: 'mobile-navigation-trigger',
    attrs: {
      type: 'button',
      'aria-label': 'Abrir menu de navegação',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
    },
    children: [
      el('span', {
        className: 'mobile-navigation-glyph',
        attrs: { 'aria-hidden': 'true' },
        children: [el('i'), el('i'), el('i')],
      }),
      el('span', { className: 'mobile-navigation-label', text: 'Menu' }),
    ],
  });

  const closeButton = el('button', {
    className: 'mobile-navigation-close',
    attrs: { type: 'button', 'aria-label': 'Fechar menu de navegação' },
    children: [
      el('span', { text: 'Fechar' }),
      el('span', { className: 'mobile-navigation-close-icon', text: '×', attrs: { 'aria-hidden': 'true' } }),
    ],
  });

  const dialog = el('dialog', {
    className: 'mobile-navigation-dialog',
    attrs: { 'aria-label': 'Menu de navegação' },
    children: [
      el('div', {
        className: 'mobile-navigation-drawer',
        children: [
          el('img', {
            className: 'mobile-navigation-mascot',
            attrs: {
              src: '/lumina-navbar-mobile.svg',
              alt: '',
              width: '260',
              height: '260',
              decoding: 'async',
              'aria-hidden': 'true',
            },
          }),
          el('div', {
            className: 'mobile-navigation-topbar',
            children: [
              el('div', {
                className: 'mobile-navigation-brand',
                children: [
                  el('strong', { className: 'mobile-navigation-wordmark', children: [renderBrandName()] }),
                  el('small', { text: 'Navegação' }),
                ],
              }),
              closeButton,
            ],
          }),
          el('nav', {
            className: 'mobile-navigation-panel',
            attrs: { 'aria-label': 'Navegação no celular' },
            children: [
              el('div', {
                className: 'mobile-navigation-panel-heading',
                children: [
                  el('strong', { text: 'Para onde vamos?' }),
                  el('small', { text: 'Acesse as ferramentas e as seções do site' }),
                ],
              }),
              el('div', {
                className: 'mobile-navigation-group mobile-navigation-group-primary',
                children: [
                  el('span', { className: 'mobile-navigation-group-label', text: 'Ferramentas' }),
                  ...links.slice(0, 2).map(({ label, href, current }) =>
                    el('a', {
                      className: current
                        ? 'mobile-navigation-link mobile-navigation-link-primary mobile-navigation-link-active'
                        : 'mobile-navigation-link mobile-navigation-link-primary',
                      attrs: { href, ...(current ? { 'aria-current': 'page' } : {}) },
                      children: [
                        el('span', { className: 'mobile-navigation-link-text', text: label }),
                        current
                          ? el('span', { className: 'mobile-navigation-current', text: 'Atual' })
                          : el('span', { className: 'mobile-navigation-link-arrow', attrs: { 'aria-hidden': 'true' }, text: '›' }),
                      ],
                    })),
                ],
              }),
              el('div', {
                className: 'mobile-navigation-group mobile-navigation-group-sections',
                children: [
                  el('span', { className: 'mobile-navigation-group-label', text: 'Nesta página' }),
                  ...links.slice(2).map(({ label, href }) =>
                    el('a', {
                      className: 'mobile-navigation-link mobile-navigation-link-secondary',
                      attrs: { href },
                      children: [
                        el('span', { className: 'mobile-navigation-link-text', text: label }),
                        el('span', { className: 'mobile-navigation-link-arrow', attrs: { 'aria-hidden': 'true' }, text: '›' }),
                      ],
                    })),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const menu = el('div', {
    className: 'mobile-navigation',
    children: [openButton, dialog],
  });

  openButton.addEventListener('click', () => {
    if (dialog.open) return;
    dialog.showModal();
    openButton.setAttribute('aria-expanded', 'true');
    closeButton.focus();
  });

  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    openButton.setAttribute('aria-expanded', 'false');
    if (openButton.isConnected) openButton.focus();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('.mobile-navigation-panel a')) {
      dialog.close();
    }
  });

  return menu;
}
