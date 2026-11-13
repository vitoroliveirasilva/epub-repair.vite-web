import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/app/createApp';
import { createConverterApp } from '../src/converter/createConverterApp';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';

afterEach(() => { document.body.replaceChildren(); });

describe('Identidade editorial no EPUB Repair', () => {
  it('mostra Lumina à esquerda, navegação horizontal e apenas as ações principais', () => {
    const root = document.createElement('div');
    document.body.append(root);
    createApp(root);
    const hero = root.querySelector<HTMLElement>('.editorial-hero');
    expect(hero).not.toBeNull();
    expect(hero?.firstElementChild?.classList.contains('hero-illustration')).toBe(true);
    expect(hero?.querySelector<HTMLImageElement>('.hero-mascot')?.getAttribute('src'))
      .toBe('/lumina-hero.svg');
    expect(hero?.querySelector('h1')?.textContent).toContain('Prepare seus livros digitais com qualidade');
    expect(hero?.querySelector('.eyebrow')).toBeNull();
    expect(hero?.querySelector('.hero-copy')).toBeNull();
    expect(root.querySelector('.hero-preview')).toBeNull();
    expect(root.querySelector('.editorial-benefits')).toBeNull();
    expect(root.querySelectorAll('.editorial-path')).toHaveLength(2);
    expect(root.querySelector<HTMLImageElement>('.brand-mark .brand-icon')?.getAttribute('src'))
      .toBe('/favicon.svg');
    expect(root.querySelector<HTMLImageElement>('.footer-brand .brand-icon')?.getAttribute('src'))
      .toBe('/favicon.svg');
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

  it('exibe Lumina invertida com somente duas tintas e sem fundo no menu de tela inteira', () => {
    for (const build of [createApp, createConverterApp]) {
      const root = document.createElement('div');
      document.body.append(root);
      build(root);
      const dialog = root.querySelector<HTMLDialogElement>('.mobile-navigation-dialog');
      expect(dialog).not.toBeNull();
      expect(dialog?.querySelector<HTMLImageElement>('.mobile-navigation-mascot')
        ?.getAttribute('src')).toBe('/lumina-navbar-mobile.svg');
      expect(dialog?.querySelector('.mobile-navigation-wordmark .brand-wordmark-repair')
        ?.textContent).toBe('Repair');
      expect(dialog?.querySelector('.mobile-navigation-close')).not.toBeNull();
      expect(dialog?.querySelectorAll('.mobile-navigation-link').length)
        .toBeGreaterThanOrEqual(4);
      root.remove();
    }
    const image = readFileSync('public/lumina-navbar-mobile.svg', 'utf8');
    expect(image).toContain('viewBox="0 0 1254 1254"');
    expect(new Set(image.match(/#[a-fA-F0-9]{6}/gu)))
      .toEqual(new Set(['#194C3E', '#FBF4E9']));
    expect(image).not.toContain('<image');
    const css = readFileSync('src/styles/mobileNavigation.css', 'utf8');
    expect(css).toContain('.mobile-navigation-mascot');
    expect(css).toContain('pointer-events: none');
    expect(css).toContain('@media (max-width: 760px)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('abre e fecha o menu sem perder foco, inclusive ao escolher um link', () => {
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

  it('organiza a mascote em uma área dedicada e mantém rolagem e cabeçalho independentes', () => {
    for (const { build, activeHref, expectedSections } of [
      { build: createApp, activeHref: '/', expectedSections: 3 },
      { build: createConverterApp, activeHref: '/converter', expectedSections: 2 },
    ]) {
      const root = document.createElement('div');
      document.body.append(root);
      build(root);
      const header = root.querySelector('.mobile-navigation-topbar');
      const panel = root.querySelector('.mobile-navigation-panel');
      const hero = panel?.querySelector('.mobile-navigation-hero');
      expect(header?.querySelector('.mobile-navigation-close')).not.toBeNull();
      expect(header?.contains(hero ?? null)).toBe(false);
      expect(hero?.querySelector('.mobile-navigation-mascot')).not.toBeNull();
      expect(hero?.querySelector('.mobile-navigation-hero-title')?.textContent).toBe('Próximapágina.');
      expect(hero?.querySelector('.mobile-navigation-hello')).toBeNull();
      expect(panel?.firstElementChild).toBe(hero);
      expect(panel?.querySelectorAll('.mobile-navigation-link-primary')).toHaveLength(2);
      expect(panel?.querySelectorAll('.mobile-navigation-link-secondary')).toHaveLength(expectedSections);
      expect(panel?.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
      expect(panel?.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe(activeHref);
      const trigger = root.querySelector('.mobile-navigation-trigger');
      expect(trigger?.getAttribute('aria-controls')).toBe('mobile-navigation-dialog');
      root.remove();
    }
    const css = readFileSync('src/styles/mobileNavigation.css', 'utf8');
    expect(css).toContain('.mobile-navigation-hero');
    expect(css).toContain('grid-template-rows: auto minmax(0, 1fr)');
    expect(css).toContain('overflow-y: auto');
    expect(css).toContain('height: 100dvh');
    expect(css).toContain('env(safe-area-inset-top, 0px)');
    expect(css).toContain('--mobile-copper: #b75c35');
    expect(css).toContain('--mobile-copper: #e3a184');
    expect(css).toContain('font-family: var(--mobile-serif)');
    expect(css).toContain('@media (max-height: 660px) and (max-width: 760px)');
    expect(readFileSync('src/main.ts', 'utf8')).toMatch(
      /import '\.\/styles\/desktopNavbar\.css';\s*import '\.\/styles\/mobileNavigation\.css';/u,
    );
  });

  it('separa os destinos por linhas editoriais sem cards, preservando acessibilidade', () => {
    for (const { build, currentHref } of [
      { build: createApp, currentHref: '/' },
      { build: createConverterApp, currentHref: '/converter' },
    ]) {
      const root = document.createElement('div');
      document.body.append(root);
      build(root);
      const dialog = root.querySelector<HTMLDialogElement>('.mobile-navigation-dialog');
      const links = [...(dialog?.querySelectorAll<HTMLAnchorElement>('.mobile-navigation-link') ?? [])];
      expect(dialog?.getAttribute('aria-label')).toBe('Menu de navegação');
      expect(dialog?.querySelector('.mobile-navigation-brand .brand-wordmark')).not.toBeNull();
      expect(links.length).toBeGreaterThanOrEqual(4);
      expect(links.filter((link) => link.getAttribute('aria-current') === 'page')).toHaveLength(1);
      expect(links.find((link) => link.getAttribute('aria-current') === 'page')?.getAttribute('href'))
        .toBe(currentHref);
      expect(dialog?.querySelectorAll('.mobile-navigation-group-label')).toHaveLength(2);
      expect(dialog?.querySelector('.mobile-navigation-footnote')?.textContent)
        .toContain('Feito para boas leituras');
      root.remove();
    }
    const css = readFileSync('src/styles/mobileNavigation.css', 'utf8');
    expect(css).toContain('border-bottom: 1px solid var(--mobile-rule)');
    expect(css).toContain('.mobile-navigation-link[aria-current="page"]::before');
    expect(css).toContain('repeating-linear-gradient');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
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
