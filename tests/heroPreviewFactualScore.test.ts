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
