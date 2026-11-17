import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app/createApp';
import { createConverterApp } from '../src/converter/createConverterApp';
import { setupScrollReveals } from '../src/ui/scrollReveals';

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];

  readonly observed: Element[] = [];
  readonly options?: IntersectionObserverInit;
  disconnected = false;

  constructor(private readonly callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.options = options;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.push(target);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  unobserve(): void {}

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  fire(target: Element, isIntersecting: boolean): void {
    const entry = { target, isIntersecting } as IntersectionObserverEntry;
    this.callback([entry], this as unknown as IntersectionObserver);
  }
}

beforeEach(() => {
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('Exibição reversível de seções durante rolagem', () => {
  it('revela ao entrar e oculta ao sair, sem atingir navbar, hero ou footer', () => {
    const root = document.createElement('div');
    root.id = 'app';
    root.innerHTML = `
      <header class="app-header"></header>
      <section class="hero epub-home"></section>
      <main id="app-workspace"><div class="workspace">
        <section class="workspace-intro"></section>
        <section class="workflow-mode-selector"></section>
      </div></main>
      <section class="capability-showcase"></section>
      <section class="support-sections">
        <div class="support-heading"></div>
        <article class="support-card"></article>
      </section>
      <footer class="app-footer"></footer>
    `;
    document.body.append(root);

    const item = root.querySelector<HTMLElement>('.workflow-mode-selector')!;
    Object.defineProperty(item, 'getBoundingClientRect', {
      value: () => ({ top: 1600, bottom: 1750, width: 600, height: 150 }),
      configurable: true,
    });

    setupScrollReveals(root);
    const observer = FakeIntersectionObserver.instances[0]!;
    expect(observer.options?.rootMargin).toBe('-4% 0px -9% 0px');
    expect(observer.observed).toContain(item);
    expect(item.dataset.scrollRevealState).toBe('hidden');

    observer.fire(item, true);
    expect(item.dataset.scrollRevealState).toBe('visible');
    observer.fire(item, false);
    expect(item.dataset.scrollRevealState).toBe('hidden');
    observer.fire(item, true);
    expect(item.dataset.scrollRevealState).toBe('visible');

    expect(root.querySelector('.app-header')?.classList.contains('scroll-reveal-element')).toBe(false);
    expect(root.querySelector('.hero')?.classList.contains('scroll-reveal-element')).toBe(false);
    expect(root.querySelector('.app-footer')?.classList.contains('scroll-reveal-element')).toBe(false);
  });

  it('mantém visível uma seção com foco e não reinicia na atualização da interface', () => {
    const root = document.createElement('div');
    root.id = 'app';
    root.innerHTML = '<main id="app-workspace"><div class="workspace">' +
      '<section class="workflow-mode-selector"><button>Escolher</button></section></div></main>';
    document.body.append(root);
    const item = root.querySelector<HTMLElement>('.workflow-mode-selector')!;
    setupScrollReveals(root);
    const oldObserver = FakeIntersectionObserver.instances[0]!;
    item.querySelector('button')!.focus();
    oldObserver.fire(item, false);
    expect(item.dataset.scrollRevealState).toBe('visible');

    root.innerHTML = '<main id="app-workspace"><div class="workspace">' +
      '<section class="workflow-mode-selector"><button>Escolher</button></section></div></main>';
    setupScrollReveals(root);
    expect(oldObserver.disconnected).toBe(true);
    expect(FakeIntersectionObserver.instances).toHaveLength(2);
    expect(root.querySelector<HTMLElement>('.workflow-mode-selector')?.dataset.scrollRevealState)
      .toBe('visible');
  });

  it('respeita movimento reduzido e funciona quando IntersectionObserver não existe', () => {
    const root = document.createElement('div');
    root.id = 'app';
    root.innerHTML = '<main id="app-workspace"><div class="workspace">' +
      '<section class="workspace-intro">Título</section></div></main>';
    document.body.append(root);
    const savedMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query.includes('prefers-reduced-motion') }),
    });
    try {
      setupScrollReveals(root);
      expect(FakeIntersectionObserver.instances).toHaveLength(0);
      expect(root.querySelector('.workspace-intro')?.classList.contains('scroll-reveal-element'))
        .toBe(false);
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: savedMatchMedia,
      });
    }
    vi.stubGlobal('IntersectionObserver', undefined);
    setupScrollReveals(root);
    expect(root.querySelector('.workspace-intro')?.classList.contains('scroll-reveal-element'))
      .toBe(false);
  });

  it('integra a animação a EPUB e conversor PDF, sem ocultar a navegação', () => {
    const epub = document.createElement('div');
    epub.id = 'app';
    document.body.append(epub);
    createApp(epub);
    expect(epub.querySelector('.workspace-intro')?.classList.contains('scroll-reveal-element'))
      .toBe(true);
    expect(epub.querySelector('.capability-showcase')?.classList.contains('scroll-reveal-element'))
      .toBe(true);
    expect(epub.querySelector('.app-header')?.classList.contains('scroll-reveal-element'))
      .toBe(false);
    expect(epub.querySelector('.app-footer')?.classList.contains('scroll-reveal-element'))
      .toBe(false);

    const pdf = document.createElement('div');
    pdf.id = 'app';
    document.body.append(pdf);
    createConverterApp(pdf);
    expect(pdf.querySelector('.converter-main > .panel')?.classList.contains('scroll-reveal-element'))
      .toBe(true);
    expect(pdf.querySelector('.converter-how .converter-how-card')?.classList.contains('scroll-reveal-element'))
      .toBe(true);
    expect(pdf.querySelector('.app-header')?.classList.contains('scroll-reveal-element'))
      .toBe(false);
    expect(pdf.querySelector('.app-footer')?.classList.contains('scroll-reveal-element'))
      .toBe(false);
  });
});
