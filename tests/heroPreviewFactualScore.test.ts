
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app/createApp';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';

afterEach(() => { document.body.replaceChildren(); });

describe('Prévia superior nunca se passa pelo diagnóstico do arquivo carregado', () => {
  it('rotula números ilustrativos e depois mostra as métricas reais do EPUB', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    createApp(root);

    const preview = root.querySelector<HTMLElement>('.hero-preview');
    expect(preview?.getAttribute('aria-label'))
      .toBe('Exemplo ilustrativo de relatório EPUB Repair');
    expect(preview?.querySelector('.preview-toolbar strong')?.textContent)
      .toBe('Exemplo ilustrativo');

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
      expect(root.querySelector('.hero-preview .preview-toolbar strong')?.textContent)
        .toBe('Relatório atual');
      expect(root.querySelector('.report-panel .score')).toBeTruthy();
    }, { timeout: 10000 });

    const latestPreview = root.querySelector('.hero-preview');
    const currentScore = root.querySelector('.report-panel .score span')?.textContent;
    const previewScore = latestPreview?.querySelector('.preview-score span')?.textContent;
    expect(previewScore).toBe(currentScore);
    expect(latestPreview?.getAttribute('aria-label')).toBe('Resumo do EPUB analisado');

    const values = Array.from(root.querySelectorAll('.stats-grid .stat-card'))
      .map(card => ({
        label: card.querySelector('small')?.textContent,
        value: card.querySelector('span')?.textContent,
      }));
    const lookup = (label: string): string | undefined =>
      values.find(value => value.label === label)?.value;
    const metrics = Array.from(latestPreview?.querySelectorAll('.preview-metric') ?? []);
    for (const [i, label] of ['Fatais', 'Erros', 'Avisos'].entries()) {
      expect(metrics[i]?.querySelector('small')?.textContent).toBe(label);
      expect(metrics[i]?.querySelector('strong')?.textContent).toBe(lookup(label));
    }
  });
});
