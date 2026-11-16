import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/app/createApp';
import { createConverterApp } from '../src/converter/createConverterApp';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';

afterEach(() => { document.body.replaceChildren(); });

describe('Identidade editorial no EPUB Repair', () => {
  it('mantém Lumina inteira, hero editorial e upload funcional fora da primeira dobra', () => {
    const root = document.createElement('div');
    document.body.append(root);
    createApp(root);

    const hero = root.querySelector<HTMLElement>('.hero.editorial-hero.epub-home');
    expect(hero).not.toBeNull();
    expect(hero?.querySelector('.home-showcase')?.children).toHaveLength(2);

    const lumina = hero?.querySelector<HTMLImageElement>('.home-mascot');
    expect(lumina?.getAttribute('src')).toBe('/lumina-hero.svg');
    expect(lumina?.getAttribute('width')).toBe('820');
    expect(lumina?.getAttribute('height')).toBe('1089');
    expect(hero?.querySelectorAll('.home-star')).toHaveLength(2);
    expect(hero?.querySelector('.home-art-halo')).not.toBeNull();
    expect(hero?.querySelector('.home-scene')).toBeNull();
    expect(hero?.querySelector('.home-bottom-waves')).toBeNull();
    expect(hero?.querySelector('.home-upload-wrap')).toBeNull();
    expect(hero?.querySelectorAll('.home-feature')).toHaveLength(0);

    const heading = hero?.querySelector('h1');
    expect(heading?.getAttribute('aria-label')).toBe('Conserte seus arquivos EPUB');
    expect(heading?.textContent).toBe('Conserte seus arquivos EPUB');
    expect(heading?.querySelector('.home-title-accent')?.textContent).toBe('EPUB');
    expect(hero?.querySelector('.home-subtitle')?.textContent)
      .toBe('Analise a estrutura, corrija arquivos problemáticos e prepare seus EPUBs para Kindle e outros e-readers, diretamente no navegador');

    expect(hero?.querySelector<HTMLAnchorElement>('.home-action-repair')?.getAttribute('href'))
      .toBe('#upload');
    expect(hero?.querySelector<HTMLAnchorElement>('.home-action-converter')?.getAttribute('href'))
      .toBe('/converter');
    expect(hero?.querySelectorAll('.home-action')).toHaveLength(2);
    expect(hero?.querySelectorAll('.home-action-symbol')).toHaveLength(0);
    expect(hero?.querySelectorAll('.home-action-arrow')).toHaveLength(0);

    const upload = root.querySelector<HTMLElement>('.workspace #upload');
    const input = upload?.querySelector<HTMLInputElement>('#epub-file-input');
    expect(upload).not.toBeNull();
    expect(hero?.querySelector('#upload')).toBeNull();
    expect(root.querySelectorAll('#upload')).toHaveLength(1);
    expect(root.querySelectorAll('#epub-file-input')).toHaveLength(1);
    expect(upload?.querySelector('#upload-title')?.textContent).toBe('Escolha seu EPUB');
    expect(input?.getAttribute('accept')).toContain('.epub');
    expect(input?.hasAttribute('multiple')).toBe(true);
    expect(upload?.querySelector<HTMLLabelElement>('.dropzone')?.htmlFor)
      .toBe('epub-file-input');
    expect(root.querySelector('#app-workspace')).not.toBeNull();
    expect(root.querySelectorAll('.editorial-path')).toHaveLength(0);

    const css = readFileSync('src/styles/homeShowcase.css', 'utf8');
    expect(css).toContain('object-fit: contain');
    expect(css).toContain('max-height: 100%');
    expect(css).toContain('font-style: italic');
    expect(css).toContain('.epub-home .home-title-accent');
    expect(css).toContain('.epub-home .home-action-converter');
    expect(css).toContain('@media (max-width: 760px)');
    expect(css).toContain('@media (max-width: 440px)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).not.toContain('.app-header');
    expect(css).not.toContain('.mobile-navigation');
    const blob = readFileSync('public/home-peach-blob.svg', 'utf8');
    expect(blob).toContain('viewBox="0 0 680 780"');
    expect(blob).toContain('#F8DCCB');
    expect(readFileSync('src/main.ts', 'utf8'))
      .toContain("import './styles/homeShowcase.css';");
    expect(root.querySelector<HTMLImageElement>('.brand-mark .brand-icon')?.getAttribute('src'))
      .toBe('/favicon.svg');
    expect(root.querySelector<HTMLImageElement>('.footer-brand .brand-icon')?.getAttribute('src'))
      .toBe('/favicon.svg');
    root.remove();
  });

  it('usa o mesmo ícone de livros na navbar do conversor e na aba do navegador', () => {
    const root = document.createElement('div');
    document.body.append(root);
    createConverterApp(root);
    expect(root.querySelector<HTMLImageElement>('.brand-mark .brand-icon')?.getAttribute('src'))
      .toBe('/favicon.svg');
    expect(root.querySelector<HTMLImageElement>('.footer-brand .brand-icon')?.getAttribute('src'))
      .toBe('/favicon.svg');
    const html = readFileSync('index.html','utf8');
    expect(html).toMatch(/rel="icon"[^>]+href="\/favicon\.svg\?v=4"/u);
    const svg = readFileSync('public/favicon.svg','utf8');
    expect(svg).toContain('viewBox="0 0 512 512"');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('#B75C35');
  });

  it('mantém configurações avançadas recolhidas e preserva a escolha ao atualizar o reparo', () => {
    const root = document.createElement('div');
    document.body.append(root);
    createApp(root);
    const settings = root.querySelector<HTMLDetailsElement>('details.advanced-settings');
    expect(settings).not.toBeNull();
    expect(settings?.open).toBe(false);
    expect(settings?.querySelectorAll('.option-item').length).toBeGreaterThan(10);
    expect(root.querySelector('.sidebar')).toBeNull();
    settings!.open = true;
    settings!.dispatchEvent(new Event('toggle'));
    const option = settings!.querySelector<HTMLInputElement>('#stripSystemFiles');
    expect(option).not.toBeNull();
    const previous = option!.checked;
    option!.click();
    const updated = root.querySelector<HTMLDetailsElement>('details.advanced-settings');
    expect(updated?.open).toBe(true);
    expect(updated?.querySelector<HTMLInputElement>('#stripSystemFiles')?.checked).toBe(!previous);
  });

  it('simplifica o conversor sem painel promocional e mantém acesso ao upload', () => {
    const root = document.createElement('div');
    document.body.append(root);
    createConverterApp(root);
    const hero = root.querySelector<HTMLElement>('.converter-hero');
    expect(hero?.querySelector('h1')?.textContent).toBe('Do PDF ao EPUB, sem complicação');
    expect(hero?.querySelector('.converter-hero-preview')).toBeNull();
    expect(hero?.querySelectorAll('.converter-feature')).toHaveLength(0);
    expect(hero?.querySelector<HTMLAnchorElement>('a[href="#pdf-upload"]')).not.toBeNull();
    expect(root.querySelector('#pdf-upload')).not.toBeNull();
  });

  it('compartilha superfície e bordas discretas nos cards e preserva os temas', () => {
    const css = readFileSync('src/styles/editorialIdentity.css', 'utf8');
    expect(css).toContain('.editorial-path-repair');
    expect(css).toContain('.converter-form-section');
    expect(css).toContain('.optional-batch-choice');
    expect(css).toContain('.advanced-settings > .options-list');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('aplica as cores da marca e os dois controles da direita nas duas navbars', () => {
    for (const build of [createApp, createConverterApp]) {
      const root = document.createElement('div');
      document.body.append(root);
      build(root);
      const brand = root.querySelector('.app-header .brand-wordmark');
      expect(brand?.querySelector('.brand-wordmark-epub')?.textContent).toBe('EPUB');
      expect(brand?.querySelector('.brand-wordmark-repair')?.textContent).toBe('Repair');
      expect(root.querySelector('.app-header .nav-theme-toggle')).not.toBeNull();
      expect(root.querySelector('.app-header .nav-primary-action')).not.toBeNull();
      expect(root.querySelectorAll('.app-header .header-nav a').length)
        .toBeGreaterThanOrEqual(4);
      root.remove();
    }
    const css = readFileSync('src/styles/navbarRefinement.css', 'utf8');
    expect(css).toContain('.brand-wordmark-repair');
    expect(css).toContain('color: #b75c35');
    expect(css).toContain('.app-header .header-nav a:hover::after');
    expect(css).toContain('.app-header .nav-primary-action:hover');
    expect(css).toContain('.app-header .nav-theme-toggle:hover');
    expect(readFileSync('src/main.ts', 'utf8'))
      .toContain("import './styles/navbarRefinement.css';");
  });

  it('sinaliza a ferramenta atual em cobre nas duas páginas sem selecionar destinos secundários', () => {
    for (const { build, href, count } of [
      { build: createApp, href: '/', count: 5 },
      { build: createConverterApp, href: '/converter', count: 4 },
    ]) {
      const root = document.createElement('div');
      document.body.append(root);
      build(root);
      const links = [...root.querySelectorAll<HTMLAnchorElement>('.app-header .header-nav a')];
      expect(links).toHaveLength(count);
      const selected = links.filter((link) => link.getAttribute('aria-current') === 'page');
      expect(selected).toHaveLength(1);
      expect(selected[0]?.getAttribute('href')).toBe(href);
      expect(links.filter((link) => link !== selected[0]).every((link) => !link.hasAttribute('aria-current')))
        .toBe(true);
      root.remove();
    }
    const css = readFileSync('src/styles/desktopNavbar.css', 'utf8');
    expect(css).toContain('color: var(--desktop-nav-copper);');
    expect(css).toContain('.header-nav a[aria-current="page"]');
    expect(css).toContain('background: color-mix(in srgb, var(--desktop-nav-copper) 11%, var(--color-surface));');
  });

  it('destaca a navegação desktop no hover e no foco sem modificar o menu mobile', () => {
    for (const build of [createApp, createConverterApp]) {
      const root = document.createElement('div');
      document.body.append(root);
      build(root);
      const nav = root.querySelector<HTMLElement>('.app-header .header-nav');
      const indicator = nav?.querySelector<HTMLElement>('.header-nav-indicator');
      const links = nav?.querySelectorAll<HTMLAnchorElement>('a');
      expect(indicator?.getAttribute('aria-hidden')).toBe('true');
      expect(links?.length).toBe(build === createApp ? 5 : 4);
      expect(nav?.classList.contains('header-nav-indicator-visible')).toBe(false);
      links?.[0]?.dispatchEvent(new Event('pointerenter'));
      expect(nav?.classList.contains('header-nav-indicator-visible')).toBe(true);
      nav?.dispatchEvent(new Event('pointerleave'));
      expect(nav?.classList.contains('header-nav-indicator-visible')).toBe(false);
      links?.[0]?.focus();
      expect(nav?.classList.contains('header-nav-indicator-visible')).toBe(true);
      links?.[0]?.blur();
      expect(nav?.classList.contains('header-nav-indicator-visible')).toBe(false);
      expect(root.querySelector('.mobile-navigation-dialog')).not.toBeNull();
      root.remove();
    }
    const css = readFileSync('src/styles/desktopNavbar.css', 'utf8');
    expect(css).toContain('@media (min-width: 761px)');
    expect(css).toContain('.header-nav-indicator-visible .header-nav-indicator');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain(':root[data-theme="dark"]');
    expect(readFileSync('src/main.ts', 'utf8')).toContain("import './styles/desktopNavbar.css';");
  });

  it('reproduz o menu aprovado com Lumina saindo do cabeçalho e botões verde e laranja', () => {
    for (const { build, currentHref, sectionCount } of [
      { build: createApp, currentHref: '/', sectionCount: 3 },
      { build: createConverterApp, currentHref: '/converter', sectionCount: 2 },
    ]) {
      const root = document.createElement('div');
      document.body.append(root);
      build(root);

      const dialog = root.querySelector<HTMLDialogElement>('.mobile-navigation-dialog');
      const hero = dialog?.querySelector<HTMLElement>('.mobile-navigation-hero');
      const mascot = hero?.querySelector<HTMLImageElement>('.mobile-navigation-mascot');
      const decoration = hero?.querySelector<HTMLImageElement>('.mobile-navigation-orbit');
      const tools = dialog?.querySelector<HTMLElement>('.mobile-navigation-group-primary');
      const links = dialog?.querySelectorAll<HTMLAnchorElement>('.mobile-navigation-tool');

      expect(dialog?.getAttribute('aria-label')).toBe('Menu de navegação');
      expect(dialog?.querySelector('.mobile-navigation-theme-toggle')).toBeNull();
      expect(dialog?.querySelector('.mobile-navigation-topbar')?.lastElementChild)
        .toBe(dialog?.querySelector('.mobile-navigation-close'));
      expect(root.querySelector('.app-header .nav-theme-toggle')).not.toBeNull();
      expect(dialog?.querySelector('.mobile-navigation-close')?.getAttribute('aria-label'))
        .toBe('Fechar menu de navegação');
      expect(dialog?.querySelector('.mobile-navigation-wordmark .brand-wordmark-repair')?.textContent)
        .toBe('Repair');
      expect(mascot?.getAttribute('src')).toBe('/lumina-navbar-mobile.svg');
      expect(mascot?.getAttribute('aria-hidden')).toBe('true');
      expect(decoration?.getAttribute('src')).toBe('/mobile-nav-ornaments.svg');
      expect(decoration?.getAttribute('aria-hidden')).toBe('true');
      expect(tools?.getAttribute('role')).toBe('group');
      expect(tools?.getAttribute('aria-label')).toBe('Ferramentas');
      expect(links).toHaveLength(2);
      expect(links?.[0]?.textContent).toBe('Reparar EPUB›');
      expect(links?.[1]?.textContent).toBe('Converter PDF›');
      expect(links?.[0]?.querySelector('.mobile-navigation-icon--book')).not.toBeNull();
      expect(links?.[1]?.querySelector('.mobile-navigation-icon--convert')).not.toBeNull();
      expect(dialog?.querySelectorAll('.mobile-navigation-section-link')).toHaveLength(sectionCount);
      expect(dialog?.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
      expect(dialog?.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe(currentHref);
      expect(root.querySelector('.mobile-navigation-trigger')?.getAttribute('aria-controls'))
        .toBe('mobile-navigation-dialog');
      expect(dialog?.textContent).not.toContain('O que você quer fazer?');
      root.remove();
    }

    const svg = readFileSync('public/lumina-navbar-mobile.svg', 'utf8');
    expect(svg).toContain('viewBox="0 0 1254 1254"');
    expect(new Set(svg.match(/#[a-fA-F0-9]{6}/gu)))
      .toEqual(new Set(['#194C3E', '#FFF9F0', '#C87531']));
    expect(svg).not.toContain('<image');
    const ornaments = readFileSync('public/mobile-nav-ornaments.svg', 'utf8');
    expect(ornaments).toContain('viewBox="0 0 390 300"');
    expect(ornaments).toContain('#c57632');
    expect(ornaments).not.toContain('stroke-width');
    expect(svg).toContain('M261,657 252,660 231,725');

    for (const icon of ['book', 'convert', 'gear', 'alert', 'chart', 'shield']) {
      expect(readFileSync(`public/mobile-nav-icon-${icon}.svg`, 'utf8')).toContain('viewBox="0 0 32 32"');
    }

    const css = readFileSync('src/styles/mobileNavigation.css', 'utf8');
    expect(css).toContain('--nav-paper: #fbf4e9');
    expect(css).toContain('--nav-forest: #0d4736');
    expect(css).toContain('--nav-orange: #dc7d28');
    expect(css).toContain('.mobile-navigation-topbar::after');
    expect(css).toContain('height: clamp(16.8rem, 36dvh, 19rem)');
    expect(css).toContain('#ead5bd 0%');
    expect(css).toContain('#f1e2cd 38%');
    expect(css).toContain('top: -1.5rem');
    expect(css).toContain('overflow: hidden');
    expect(css).toContain('.mobile-navigation-tool--convert');
    expect(css).toContain('background: var(--nav-orange)');
    expect(css).toContain('border-radius: 1.15rem');
    expect(css).toContain('font-family: Georgia, "Literata", serif');
    expect(css).toContain('.mobile-navigation-section-link');
    expect(css).not.toContain('.mobile-navigation-theme-toggle');
    expect(css).toContain('height: 100dvh');
    expect(css).toContain('overflow-y: auto');
    expect(css).toContain('env(safe-area-inset-top, 0px)');
    expect(css).toContain('@media (max-width: 360px)');
    expect(css).toContain('@media (max-height: 690px) and (max-width: 760px)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce) and (max-width: 760px)');
    expect(readFileSync('public/theme-sun.svg', 'utf8')).toContain('viewBox="0 0 24 24"');
    expect(readFileSync('public/theme-moon.svg', 'utf8')).toContain('viewBox="0 0 24 24"');
  });

  it('abre, fecha e restaura foco no menu mobile ao escolher um link', () => {
    const root = document.createElement('div');
    document.body.append(root);
    createApp(root);
    const trigger = root.querySelector<HTMLButtonElement>('.mobile-navigation-trigger')!;
    const dialog = root.querySelector<HTMLDialogElement>('.mobile-navigation-dialog')!;
    const closeButton = root.querySelector<HTMLButtonElement>('.mobile-navigation-close')!;
    Object.defineProperty(dialog, 'showModal', {
      configurable: true,
      value: () => { dialog.setAttribute('open', ''); },
    });
    Object.defineProperty(dialog, 'close', {
      configurable: true,
      value: () => {
        dialog.removeAttribute('open');
        dialog.dispatchEvent(new Event('close'));
      },
    });
    trigger.click();
    expect(dialog.open).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(closeButton);
    closeButton.click();
    expect(dialog.open).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    trigger.click();
    const internalLink = dialog.querySelector<HTMLAnchorElement>('a[href="#privacy"]')!;
    internalLink.addEventListener('click', (event) => event.preventDefault());
    internalLink.click();
    expect(dialog.open).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    root.remove();
  });

  it('exibe métricas reais apenas no relatório após analisar o arquivo carregado', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    createApp(root);
    expect(root.querySelector('.hero-preview')).toBeNull();
    expect(root.querySelector('.report-panel .score')).toBeNull();
    const bytes = await buildKindleIssueEpub();
    const file = {
      name: 'epub-sintetico.epub',
      size: bytes.length,
      arrayBuffer: () => Promise.resolve(Uint8Array.from(bytes).buffer),
    } as File;
    const input = root.querySelector<HTMLInputElement>('#epub-file-input');
    expect(input).toBeTruthy();
    Object.defineProperty(input!, 'files', { configurable: true, value: [file] });
    input!.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => {
      const report = root.querySelector('.report-panel');
      expect(report?.querySelector('.score span')?.textContent).toMatch(/^\d+$/u);
      expect(report?.querySelectorAll('.stats-grid .stat-card')).toHaveLength(7);
    }, { timeout: 10000 });
    expect(root.querySelector('.hero-preview')).toBeNull();
  });
});
