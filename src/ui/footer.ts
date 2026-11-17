import { renderBrandName } from './brand';
import { el } from './dom';

type FooterIconName =
  | 'layers'
  | 'sparkle'
  | 'shield'
  | 'file'
  | 'github'
  | 'code'
  | 'external'
  | 'moon';

const iconPaths: Record<FooterIconName, string[]> = {
  layers: ['m12 2 9 5-9 5-9-5 9-5Z', 'm3 12 9 5 9-5', 'm3 17 9 5 9-5'],
  sparkle: ['m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z'],
  shield: ['M12 3 5 6v5c0 4.6 2.9 8.2 7 10 4.1-1.8 7-5.4 7-10V6l-7-3Z', 'm9 12 2 2 4-5'],
  file: ['M7 3h7l4 4v14H7V3Z', 'M14 3v5h5', 'M10 13h5', 'M10 17h5'],
  github: ['M15 22v-3.9c0-1 .1-1.4-.5-2 2.7-.3 5.5-1.3 5.5-6A4.7 4.7 0 0 0 18.7 7a4.4 4.4 0 0 0-.1-3.1s-1-.3-3.3 1.2a11.5 11.5 0 0 0-6 0C7 3.6 6 3.9 6 3.9A4.4 4.4 0 0 0 5.9 7 4.7 4.7 0 0 0 4.6 10c0 4.7 2.8 5.7 5.5 6-.4.4-.6.9-.6 1.7V22', 'M9.5 19c-3 .9-3-1.7-4.2-2.1'],
  code: ['m8 9-3 3 3 3', 'm16 9 3 3-3 3', 'm14 5-4 14'],
  external: ['M14 5h5v5', 'm19 5-8 8', 'M18 13v6H5V6h6'],
  moon: ['M20 15.2A8.5 8.5 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2Z'],
};

function footerIcon(name: FooterIconName, className = 'editorial-footer-icon'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  for (const data of iconPaths[name]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', data);
    svg.append(path);
  }

  return svg;
}

function footerLink(
  icon: FooterIconName,
  label: string,
  href: string,
  external = false,
): HTMLAnchorElement {
  return el('a', {
    className: 'editorial-footer-link',
    attrs: external
      ? { href, target: '_blank', rel: 'noreferrer noopener' }
      : { href },
    children: [
      footerIcon(icon),
      el('span', { text: label }),
      external ? footerIcon('external', 'editorial-footer-external') : undefined,
    ],
  });
}

function iconLink(
  icon: FooterIconName,
  label: string,
  href: string,
  external = false,
): HTMLAnchorElement {
  return el('a', {
    className: 'editorial-footer-action',
    attrs: external
      ? { href, target: '_blank', rel: 'noreferrer noopener', 'aria-label': label, title: label }
      : { href, 'aria-label': label, title: label },
    children: [footerIcon(icon)],
  });
}

export function renderEditorialFooter(onThemeToggle: () => void): HTMLElement {
  const themeButton = el('button', {
    className: 'editorial-footer-action',
    attrs: {
      type: 'button',
      'aria-label': 'Alternar tema claro e escuro',
      title: 'Alternar tema',
    },
    children: [footerIcon('moon')],
  });
  themeButton.addEventListener('click', onThemeToggle);

  return el('footer', {
    className: 'footer app-footer editorial-footer',
    children: [
      el('div', {
        className: 'editorial-footer-content',
        children: [
          el('section', {
            className: 'editorial-footer-brand',
            attrs: { 'aria-label': 'EPUB Repair' },
            children: [
              el('a', {
                className: 'footer-brand',
                attrs: { href: '/#top', 'aria-label': 'EPUB Repair, voltar ao início' },
                children: [renderBrandName()],
              }),
              el('p', {
                text: 'Conserte, organize e prepare seus EPUBs para uma leitura melhor no Kindle e em outros e-readers.',
              }),
            ],
          }),
          el('nav', {
            className: 'editorial-footer-nav editorial-footer-product',
            attrs: { 'aria-labelledby': 'footer-product-title' },
            children: [
              el('h2', { text: 'Produto', attrs: { id: 'footer-product-title' } }),
              footerLink('layers', 'Como funciona', '/converter#converter-how'),
              footerLink('sparkle', 'Recursos', '/#app-workspace'),
              footerLink('shield', 'Limitações', '/#limitations'),
              footerLink('file', 'Relatório', '/#app-workspace'),
            ],
          }),
          el('nav', {
            className: 'editorial-footer-nav editorial-footer-project',
            attrs: { 'aria-labelledby': 'footer-links-title' },
            children: [
              el('h2', { text: 'Links', attrs: { id: 'footer-links-title' } }),
              footerLink(
                'github',
                'Projeto no GitHub',
                'https://github.com/vitoroliveirasilva/epub-repair.vite-web',
                true,
              ),
              footerLink('code', 'Desenvolvedor', 'https://github.com/vitoroliveirasilva', true),
              footerLink('file', 'Converter PDF', '/converter'),
            ],
          }),
          el('div', {
            className: 'editorial-footer-art',
            children: [
              el('img', {
                attrs: {
                  src: '/lumina-footer.webp',
                  alt: 'Lumina preparando café em um V60',
                  width: '707',
                  height: '780',
                  loading: 'lazy',
                  decoding: 'async',
                },
              }),
            ],
          }),
        ],
      }),
      el('div', {
        className: 'editorial-footer-wave',
        children: [
          el('div', {
            className: 'editorial-footer-bottom',
            children: [
              el('span', {
                className: 'editorial-footer-copyright',
                text: `© ${new Date().getFullYear()} Vitor Oliveira Silva · EPUB Repair`,
              }),
              el('span', { className: 'editorial-footer-rule', attrs: { 'aria-hidden': 'true' } }),
              el('nav', {
                className: 'editorial-footer-actions',
                attrs: { 'aria-label': 'Atalhos do rodapé' },
                children: [
                  iconLink(
                    'github',
                    'Projeto EPUB Repair no GitHub',
                    'https://github.com/vitoroliveirasilva/epub-repair.vite-web',
                    true,
                  ),
                  iconLink('code', 'Perfil do desenvolvedor', 'https://github.com/vitoroliveirasilva', true),
                  iconLink('file', 'Converter PDF para EPUB', '/converter'),
                  themeButton,
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
