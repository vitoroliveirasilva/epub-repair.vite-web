import { el } from './dom';
import { renderBrandName } from './brand';

export type MobileNavigationPage = 'repair' | 'converter';

export function renderMobileNavigation(page: MobileNavigationPage): HTMLElement {
  const tools = [
    { title: 'Reparar EPUB', href: '/', icon: 'book', current: page === 'repair' },
    { title: 'Converter PDF', href: '/converter', icon: 'convert', current: page === 'converter' },
  ];
  const sections = page === 'converter'
    ? [
        { title: 'Como funciona', href: '#converter-how', icon: 'gear' },
        { title: 'Privacidade', href: '#converter-privacy', icon: 'shield' },
      ]
    : [
        { title: 'Como funciona', href: '#privacy', icon: 'gear' },
        { title: 'Limitações', href: '#limitations', icon: 'alert' },
        { title: 'Relatório', href: '#app-workspace', icon: 'chart' },
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
    children: [el('span', { className: 'mobile-navigation-close-icon', text: '×', attrs: { 'aria-hidden': 'true' } })],
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
              el('strong', { className: 'mobile-navigation-wordmark', children: [renderBrandName()] }),
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
                  el('img', {
                    className: 'mobile-navigation-orbit',
                    attrs: {
                      src: '/mobile-nav-ornaments.svg',
                      alt: '',
                      width: '390',
                      height: '300',
                      decoding: 'async',
                      'aria-hidden': 'true',
                      draggable: 'false',
                    },
                  }),
                  el('img', {
                    className: 'mobile-navigation-mascot',
                    attrs: {
                      src: '/lumina-navbar-mobile.svg',
                      alt: '',
                      width: '1254',
                      height: '1254',
                      decoding: 'async',
                      'aria-hidden': 'true',
                      draggable: 'false',
                    },
                  }),
                ],
              }),
              el('div', {
                className: 'mobile-navigation-collection',
                children: [
                  el('div', {
                    className: 'mobile-navigation-group mobile-navigation-group-primary',
                    attrs: { role: 'group', 'aria-label': 'Ferramentas' },
                    children: tools.map(({ title, href, icon, current }) =>
                      el('a', {
                        className: `mobile-navigation-tool mobile-navigation-tool--${icon}`,
                        attrs: { href, ...(current ? { 'aria-current': 'page' } : {}) },
                        children: [
                          el('span', {
                            className: `mobile-navigation-tool-icon mobile-navigation-icon--${icon}`,
                            attrs: { 'aria-hidden': 'true' },
                          }),
                          el('span', { className: 'mobile-navigation-tool-divider', attrs: { 'aria-hidden': 'true' } }),
                          el('strong', { text: title }),
                          el('span', { className: 'mobile-navigation-tool-chevron', text: '›', attrs: { 'aria-hidden': 'true' } }),
                        ],
                      })),
                  }),
                  el('div', {
                    className: 'mobile-navigation-group mobile-navigation-group-sections',
                    children: sections.map(({ title, href, icon }) =>
                      el('a', {
                        className: 'mobile-navigation-section-link',
                        attrs: { href },
                        children: [
                          el('span', {
                            className: `mobile-navigation-section-icon mobile-navigation-icon--${icon}`,
                            attrs: { 'aria-hidden': 'true' },
                          }),
                          el('span', { text: title }),
                          el('span', { className: 'mobile-navigation-section-chevron', text: '›', attrs: { 'aria-hidden': 'true' } }),
                        ],
                      })),
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const mobileNav = el('div', { className: 'mobile-navigation', children: [trigger, dialog] });

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
