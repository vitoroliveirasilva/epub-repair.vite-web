import { el } from './dom';
import { renderBrandName } from './brand';

export type MobileNavigationPage = 'repair' | 'converter';

export function renderMobileNavigation(page: MobileNavigationPage): HTMLElement {
  const tools = [
    {
      title: 'Reparar EPUB',
      href: '/',
      current: page === 'repair',
    },
    {
      title: 'Converter PDF',
      href: '/converter',
      current: page === 'converter',
    },
  ];
  const sections = page === 'converter'
    ? [
        { title: 'Como funciona', href: '#converter-how' },
        { title: 'Privacidade', href: '#converter-privacy' },
      ]
    : [
        { title: 'Como funciona', href: '#privacy' },
        { title: 'Limitações', href: '#limitations' },
        { title: 'Relatório', href: '#app-workspace' },
      ];

  const trigger = el('button', {
    className: 'mobile-navigation-trigger',
    attrs: {
      type: 'button',
      'aria-label': 'Abrir menu de navegação',
      'aria-controls': 'mobile-navigation-dialog',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
    },
    children: [
      el('span', { className: 'mobile-navigation-label', text: 'Menu' }),
      el('span', {
        className: 'mobile-navigation-glyph',
        attrs: { 'aria-hidden': 'true' },
        children: [el('i'), el('i')],
      }),
    ],
  });

  const closeButton = el('button', {
    className: 'mobile-navigation-close',
    attrs: { type: 'button', 'aria-label': 'Fechar menu de navegação' },
    children: [
      el('span', { className: 'mobile-navigation-close-label', text: 'Fechar' }),
      el('span', { className: 'mobile-navigation-close-icon', text: '×', attrs: { 'aria-hidden': 'true' } }),
    ],
  });

  const dialog = el('dialog', {
    className: 'mobile-navigation-dialog',
    attrs: { id: 'mobile-navigation-dialog', 'aria-label': 'Menu de navegação' },
    children: [
      el('div', {
        className: 'mobile-navigation-drawer',
        children: [
          el('div', {
            className: 'mobile-navigation-topbar',
            children: [
              el('div', {
                className: 'mobile-navigation-brand',
                children: [
                  el('strong', { className: 'mobile-navigation-wordmark', children: [renderBrandName()] }),
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
                className: 'mobile-navigation-hero',
                children: [
                  el('h2', { className: 'mobile-navigation-hero-title', text: 'O que você quer fazer?' }),
                  el('img', {
                    className: 'mobile-navigation-mascot',
                    attrs: {
                      src: '/lumina-navbar-mobile.svg',
                      alt: '',
                      width: '260',
                      height: '260',
                      decoding: 'async',
                      draggable: 'false',
                      'aria-hidden': 'true',
                    },
                  }),
                ],
              }),
              el('div', {
                className: 'mobile-navigation-collection',
                children: [
                  el('div', {
                    className: 'mobile-navigation-group mobile-navigation-group-primary',
                    children: [
                      el('span', { className: 'mobile-navigation-group-label', text: 'Ferramentas' }),
                      ...tools.map(({ title, href, current }, index) =>
                        el('a', {
                          className: current
                            ? 'mobile-navigation-link mobile-navigation-link-primary mobile-navigation-link-active'
                            : 'mobile-navigation-link mobile-navigation-link-primary',
                          attrs: { href, ...(current ? { 'aria-current': 'page' } : {}) },
                          children: [
                            el('span', {
                              className: 'mobile-navigation-link-index',
                              attrs: { 'aria-hidden': 'true' },
                              text: `0${index + 1}`,
                            }),
                            el('span', {
                              className: 'mobile-navigation-link-copy',
                              children: [
                                el('strong', { text: title }),
                              ],
                            }),
                            current
                              ? el('span', { className: 'mobile-navigation-current', text: 'Atual' })
                              : el('span', {
                                  className: 'mobile-navigation-link-arrow',
                                  attrs: { 'aria-hidden': 'true' },
                                  text: '↗',
                                }),
                          ],
                        })),
                    ],
                  }),
                  el('div', {
                    className: 'mobile-navigation-group mobile-navigation-group-sections',
                    children: [
                      el('span', { className: 'mobile-navigation-group-label', text: 'Nesta página' }),
                      ...sections.map(({ title, href }) =>
                        el('a', {
                          className: 'mobile-navigation-link mobile-navigation-link-secondary',
                          attrs: { href },
                          children: [
                            el('span', { className: 'mobile-navigation-link-text', text: title }),
                            el('span', {
                              className: 'mobile-navigation-link-arrow',
                              attrs: { 'aria-hidden': 'true' },
                              text: '↗',
                            }),
                          ],
                        })),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const mobileNav = el('div', {
    className: 'mobile-navigation',
    children: [trigger, dialog],
  });

  const closeOnDesktop = (): void => {
    if (window.innerWidth > 760 && dialog.open) dialog.close();
  };

  trigger.addEventListener('click', () => {
    if (dialog.open) return;
    dialog.showModal();
    trigger.setAttribute('aria-expanded', 'true');
    window.addEventListener('resize', closeOnDesktop);
    closeButton.focus();
  });

  closeButton.addEventListener('click', () => dialog.close());

  dialog.addEventListener('close', () => {
    trigger.setAttribute('aria-expanded', 'false');
    window.removeEventListener('resize', closeOnDesktop);
    if (trigger.isConnected) trigger.focus({ preventScroll: true });
  });

  dialog.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('.mobile-navigation-panel a')) {
      dialog.close();
    }
  });

  return mobileNav;
}
