import { el } from './dom';
import { renderBrandName } from './brand';

export type MobileNavigationPage = 'repair' | 'converter';

export function renderMobileNavigation(page: MobileNavigationPage): HTMLElement {
  const tools = [
    {
      label: 'Reparar EPUB',
      description: 'Verificar e cuidar do seu livro',
      href: '/',
      current: page === 'repair',
    },
    {
      label: 'Converter PDF',
      description: 'De PDF para um livro digital',
      href: '/converter',
      current: page === 'converter',
    },
  ];
  const sections = page === 'converter'
    ? [
        { label: 'Como funciona', href: '#converter-how' },
        { label: 'Privacidade', href: '#converter-privacy' },
      ]
    : [
        { label: 'Como funciona', href: '#privacy' },
        { label: 'Limitações', href: '#limitations' },
        { label: 'Relatório', href: '#app-workspace' },
      ];

  const openButton = el('button', {
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
                  el('strong', {
                    className: 'mobile-navigation-wordmark',
                    children: [renderBrandName()],
                  }),
                  el('small', { text: 'Índice de navegação' }),
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
                  el('div', {
                    className: 'mobile-navigation-hero-copy',
                    children: [
                      el('span', { className: 'mobile-navigation-hero-label', text: 'ÍNDICE / 01' }),
                      el('strong', {
                        className: 'mobile-navigation-hero-title',
                        children: [
                          el('span', { text: 'Próxima' }),
                          el('em', { text: 'página.' }),
                        ],
                      }),
                      el('span', { className: 'mobile-navigation-hero-caption', text: 'Escolha seu caminho' }),
                    ],
                  }),
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
                className: 'mobile-navigation-group mobile-navigation-group-primary',
                children: [
                  el('span', { className: 'mobile-navigation-group-label', text: '01 / Ferramentas' }),
                  ...tools.map(({ label, description, href, current }, index) =>
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
                            el('strong', { text: label }),
                            el('small', { text: description }),
                          ],
                        }),
                        current
                          ? el('span', { className: 'mobile-navigation-current', text: 'Aqui' })
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
                  el('span', { className: 'mobile-navigation-group-label', text: '02 / Nesta página' }),
                  ...sections.map(({ label, href }) =>
                    el('a', {
                      className: 'mobile-navigation-link mobile-navigation-link-secondary',
                      attrs: { href },
                      children: [
                        el('span', { className: 'mobile-navigation-link-text', text: label }),
                        el('span', {
                          className: 'mobile-navigation-link-arrow',
                          attrs: { 'aria-hidden': 'true' },
                          text: '↗',
                        }),
                      ],
                    })),
                ],
              }),
              el('div', {
                className: 'mobile-navigation-footnote',
                children: [
                  el('span', { text: 'Feito para boas leituras' }),
                  el('span', { attrs: { 'aria-hidden': 'true' }, text: 'EPUB · REPAIR' }),
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

  const closeOnDesktop = (): void => {
    if (window.innerWidth > 760 && dialog.open) dialog.close();
  };

  openButton.addEventListener('click', () => {
    if (dialog.open) return;
    dialog.showModal();
    openButton.setAttribute('aria-expanded', 'true');
    window.addEventListener('resize', closeOnDesktop);
    closeButton.focus();
  });

  closeButton.addEventListener('click', () => dialog.close());

  dialog.addEventListener('close', () => {
    openButton.setAttribute('aria-expanded', 'false');
    window.removeEventListener('resize', closeOnDesktop);
    if (openButton.isConnected) openButton.focus({ preventScroll: true });
  });

  dialog.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('.mobile-navigation-panel a')) {
      dialog.close();
    }
  });

  return menu;
}
