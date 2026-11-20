import { el } from './dom';

export type DesktopNavigationLink = {
  label: string;
  href: string;
  current?: boolean;
};

export function renderDesktopNavigation(links: readonly DesktopNavigationLink[]): HTMLElement {
  const indicator = el('span', {
    className: 'header-nav-indicator',
    attrs: { 'aria-hidden': 'true' },
  });
  const anchors = links.map(({ label, href, current }) => el('a', {
    text: label,
    attrs: { href, ...(current ? { 'aria-current': 'page' } : {}) },
  }));
  const nav = el('nav', {
    className: 'header-nav',
    attrs: { 'aria-label': 'Navegação principal' },
    children: [indicator, ...anchors],
  });

  const highlight = (anchor: HTMLAnchorElement): void => {
    indicator.style.width = `${anchor.offsetWidth}px`;
    indicator.style.transform = `translate3d(${anchor.offsetLeft}px, 0, 0)`;
    nav.classList.add('header-nav-indicator-visible');
  };

  const hide = (): void => {
    nav.classList.remove('header-nav-indicator-visible');
  };

  for (const anchor of anchors) {
    anchor.addEventListener('pointerenter', () => highlight(anchor));
    anchor.addEventListener('focus', () => highlight(anchor));
  }

  nav.addEventListener('pointerleave', () => {
    const focused = document.activeElement;
    if (focused instanceof HTMLAnchorElement && nav.contains(focused)) {
      highlight(focused);
    } else {
      hide();
    }
  });

  nav.addEventListener('focusout', (event) => {
    if (!(event.relatedTarget instanceof Node) || !nav.contains(event.relatedTarget)) {
      hide();
    }
  });

  return nav;
}
