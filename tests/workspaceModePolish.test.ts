import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app/createApp';
import { createConverterApp } from '../src/converter/createConverterApp';
import { renderCoverChanger } from '../src/ui/components/CoverChanger';
import { createInitialState } from '../src/app/state';
import { enableCoverPreviewTilt } from '../src/ui/coverPreviewTilt';

afterEach(() => document.body.replaceChildren());

describe('Estúdio de restauração e escolha de modo', () => {
  it('usa apenas Estúdio de restauração como título da seção', () => {
    const root = document.createElement('div');
    root.id = 'app';
    document.body.append(root);
    createApp(root);

    const intro = root.querySelector<HTMLElement>('.workspace-intro-compact')!;
    const title = intro.querySelector('h2');
    expect(title?.textContent).toBe('Estúdio de restauração');
    expect(intro.querySelectorAll('h2')).toHaveLength(1);
    expect(intro.textContent).not.toContain('Do arquivo problemático ao EPUB pronto para leitura');
    expect(intro.querySelector('.eyebrow')).toBeNull();
  });

  it('mostra a escolha de um ou vários EPUBs com títulos e descrições separados', () => {
    const root = document.createElement('div');
    root.id = 'app';
    document.body.append(root);
    createApp(root);

    const selector = root.querySelector('.workflow-mode-selector')!;
    expect(selector.querySelector('h3')?.textContent)
      .toBe('Quantos livros vamos cuidar?');
    expect(selector.querySelector('p')?.textContent)
      .toBe('Escolha um modo para ver só as opções necessárias');
    const options = Array.from(selector.querySelectorAll<HTMLButtonElement>('.workflow-mode-card'));
    expect(options).toHaveLength(2);
    expect(options.map((choice) =>
      choice.querySelector('.workflow-mode-title')?.textContent))
      .toEqual(['Um EPUB', 'Vários EPUBs']);
    expect(options[0]?.querySelector('.workflow-mode-description')?.textContent)
      .toContain('reparos individuais');
    expect(options[1]?.querySelector('.workflow-mode-description')?.textContent)
      .toContain('até 6 livros');
    expect(options.map((choice) => choice.getAttribute('aria-pressed')))
      .toEqual(['true', 'false']);

    options[1]!.click();
    expect(root.querySelector('.batch-studio')).not.toBeNull();
    const batchOptions = root.querySelectorAll<HTMLButtonElement>('.workflow-mode-card');
    expect(batchOptions[1]?.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('.controls-panel')).toBeNull();

    batchOptions[0]!.click();
    expect(root.querySelector('.controls-panel')).not.toBeNull();
    expect(root.querySelector('.batch-studio')).toBeNull();
  });

  it('mantém as três etapas do EPUB individual com número, título e explicação', () => {
    const root = document.createElement('div');
    root.id = 'app';
    document.body.append(root);
    createApp(root);

    const steps = Array.from(root.querySelectorAll<HTMLElement>(
      '.workspace-core .controls-panel .flow-step'));
    expect(steps).toHaveLength(3);
    expect(steps.map((item) => item.querySelector('strong')?.textContent))
      .toEqual(['Verificar', 'Corrigir, otimizar ou trocar capa', 'Baixar']);
    expect(steps.map((item) => item.querySelector('.flow-step-number')?.textContent))
      .toEqual(['1', '2', '3']);
    expect(steps.every((item) => Boolean(item.querySelector('small')?.textContent)))
      .toBe(true);
  });
  it('mantém o desenho preso à folha animada nos uploads EPUB, PDF e imagem da capa', () => {
    const epubRoot = document.createElement('div');
    epubRoot.id = 'app';
    document.body.append(epubRoot);
    createApp(epubRoot);

    const epub = epubRoot.querySelector('.upload-studio-graphic-epub')!;
    expect(epub.querySelector('.upload-studio-sheet-front > .upload-studio-lines'))
      .not.toBeNull();
    expect(epub.querySelectorAll('.upload-studio-lines')).toHaveLength(1);

    const cover = epubRoot.querySelector('.cover-upload-illustration')!;
    expect(cover.querySelector('.cover-upload-sheet-front > .cover-upload-sun'))
      .not.toBeNull();
    expect(cover.querySelector('.cover-upload-sheet-front > .cover-upload-mountain'))
      .not.toBeNull();

    const pdfRoot = document.createElement('div');
    pdfRoot.id = 'pdf-app';
    document.body.append(pdfRoot);
    createConverterApp(pdfRoot);

    const pdf = pdfRoot.querySelector('.upload-studio-graphic-pdf')!;
    expect(pdf.querySelector('.upload-studio-sheet-front > .upload-studio-lines'))
      .not.toBeNull();
    expect(pdf.querySelectorAll('.upload-studio-lines')).toHaveLength(1);
  });

  it('preserva a prévia da capa e aplica o tilt somente no invólucro', () => {
    const state = createInitialState();
    state.coverImage = {
      fileName: 'nova-capa.png',
      mediaType: 'image/png',
      bytes: new Uint8Array([137, 80, 78, 71]),
      previewDataUrl: 'data:image/png;base64,AAAA',
    } as NonNullable<typeof state.coverImage>;
    const root = document.createElement('div');
    root.id = 'app';
    document.body.append(root);
    const actions = {
      selectCoverImage: () => {},
      clearCoverImage: () => {},
      applyCoverReplacement: () => {},
    };
    const render = (): void => root.replaceChildren(renderCoverChanger(state, actions));
    render();

    const cover = root.querySelector<HTMLElement>('.cover-preview-tilt')!;
    const figure = cover.querySelector<HTMLElement>('figure.cover-new-preview')!;
    expect(figure.querySelector('img')?.getAttribute('src')).toBe(state.coverImage.previewDataUrl);
    expect(figure.style.transform).toBe('');
    expect(root.querySelector('.cover-studio-preview-copy strong')?.textContent)
      .toBe('Sua nova capa');
    const savedMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('hover: hover'),
        media: query,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      }),
    });
    try {
      enableCoverPreviewTilt(root);
      expect(cover.style.transform).toContain('perspective(1200px)');
      expect(figure.style.transform).toBe('');

      render();
      enableCoverPreviewTilt(root);
      expect(root.querySelector<HTMLElement>('.cover-preview-tilt')?.style.transform)
        .toContain('perspective(1200px)');

      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: (query: string) => ({
          matches: query.includes('reduced-motion'),
          media: query,
        }),
      });
      enableCoverPreviewTilt(root);
      expect(root.querySelector<HTMLElement>('.cover-preview-tilt')?.style.transform).toBe('');
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: savedMatchMedia,
      });
    }
  });

  it('não aplica a inclinação quando ainda não existe uma imagem de capa', () => {
    const state = createInitialState();
    const root = document.createElement('div');
    root.id = 'app';
    document.body.append(root);
    root.append(renderCoverChanger(state, {
      selectCoverImage: () => {},
      clearCoverImage: () => {},
      applyCoverReplacement: () => {},
    }));
    expect(root.querySelector('.cover-preview-tilt')).toBeNull();
    expect(root.querySelector('.cover-new-preview-empty')).not.toBeNull();
    enableCoverPreviewTilt(root);
  });

});
