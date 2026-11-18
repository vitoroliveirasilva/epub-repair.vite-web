import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app/createApp';
import { createConverterApp } from '../src/converter/createConverterApp';
import { renderCoverChanger } from '../src/ui/components/CoverChanger';
import { createInitialState } from '../src/app/state';
import { enableCoverPreviewTilt } from '../src/ui/coverPreviewTilt';
import { renderOptionalEpubTools } from '../src/ui/optionalEpubTools';
import { renderFileSummary } from '../src/ui/components/FileSummary';
import { renderControls } from '../src/ui/components/Controls';
import { renderOptionsPanel } from '../src/ui/components/OptionsPanel';
import { renderStatusMessage } from '../src/ui/components/ErrorPanel';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { buildKindleChecks } from '../src/epub/tools/bookTools';

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
      '.workspace-core .controls-panel .epub-stage-item'));
    expect(steps).toHaveLength(3);
    expect(steps.map((item) => item.querySelector('strong')?.textContent))
      .toEqual(['Verificar', 'Corrigir', 'Baixar']);
    expect(steps.map((item) => item.querySelector('.epub-stage-item-number')?.textContent))
      .toEqual(['1', '2', '3']);
    expect(steps.map((item) => item.querySelector('small')?.textContent))
      .toEqual(['Selecione um EPUB', 'Reparos e ajustes', 'Cópia final']);
    expect(steps[0]?.classList.contains('epub-stage-item-active')).toBe(true);
    expect(steps[0]?.getAttribute('aria-current')).toBe('step');
    expect(steps.slice(1).every((item) => item.classList.contains('epub-stage-item-pending')))
      .toBe(true);
    expect(steps[0]?.querySelector('.epub-stage-item-status')?.textContent).toBe('Comece aqui');
    expect(steps.every((item) => item.querySelector('.epub-stage-item-number')?.textContent !== '✓'))
      .toBe(true);
    expect(root.querySelectorAll('.flow-step-book, .flow-step-visual-glyph')).toHaveLength(0);
    const rail = root.querySelector<HTMLElement>('nav.epub-stage-rail');
    const track = rail?.querySelector('ol.epub-stage-track');
    expect(rail).not.toBeNull();
    expect(track?.parentElement).toBe(rail);
    expect(track?.children).toHaveLength(3);
    expect(root.querySelector('.flow-steps, .flow-step')).toBeNull();
    const styles = readFileSync('src/styles/epubStageRail.css', 'utf8');
    expect(styles).toContain('display: block;');
    expect(styles).toContain('container: epub-stage-rail / inline-size;');
    expect(styles).not.toContain('.flow-step');
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
    };
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
    const savedMatchMedia = window.matchMedia?.bind(window);
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
      expect(cover.style.willChange).toBe('transform');
      expect(figure.style.transform).toBe('');

      render();
      enableCoverPreviewTilt(root);
      expect(root.querySelector<HTMLElement>('.cover-preview-tilt')?.style.willChange)
        .toBe('transform');

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

  it('exibe o diagnóstico inicial com informações claras e link funcional ao envio', () => {
    const root = document.createElement('div');
    root.id = 'app';
    document.body.append(root);
    createApp(root);

    const card = root.querySelector('.report-welcome')!;
    expect(card.querySelector('#report-welcome-title')?.textContent)
      .toBe('Envie um EPUB para começar');
    expect(card.querySelectorAll('.report-welcome-highlights span')).toHaveLength(3);
    expect(card.querySelector<HTMLAnchorElement>('.report-welcome-link')?.getAttribute('href'))
      .toBe('#upload');
    expect(root.querySelector('#upload')).not.toBeNull();
  });

  it('mantém três ferramentas extras sem separar Kindle ou lote', () => {
    const state = createInitialState();
    const root = document.createElement('div');
    document.body.append(root);
    const render = (): void => {
      root.replaceChildren(renderOptionalEpubTools(state, render, () => {}));
    };
    render();
    const tools = root.querySelector<HTMLDetailsElement>('.optional-studio')!;
    expect(tools.open).toBe(false);
    expect(tools.querySelector('.optional-studio-heading')?.textContent).not.toContain('lote');
    expect(tools.querySelectorAll('.optional-studio-tab')).toHaveLength(3);
    const summary = tools.querySelector('summary.workbench-heading-row')!;
    expect(summary).not.toBeNull();
    const artwork = summary.querySelector('.workbench-header-art')!;
    expect(artwork.getAttribute('aria-hidden')).toBe('true');
    expect(artwork.querySelector('.workbench-header-orbit')).not.toBeNull();
    expect(artwork.querySelector('.workbench-header-stamp')).toBeNull();
    const icon = artwork.querySelector('svg.workbench-book-mark')!;
    expect(icon).not.toBeNull();
    expect(icon.getAttribute('viewBox')).toBe('0 0 128 128');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.querySelectorAll('path')).toHaveLength(5);
    expect(icon.querySelectorAll('path[fill-rule="evenodd"]')).toHaveLength(5);
    expect(icon.querySelector('.workbench-book-silhouette')).not.toBeNull();
    expect(icon.querySelector('.workbench-book-ink')).not.toBeNull();
    expect(icon.querySelector('.workbench-book-back')).not.toBeNull();
    expect(icon.querySelector('.workbench-book-spine')).not.toBeNull();
    expect(icon.querySelector('.workbench-book-text')).not.toBeNull();
    expect(summary.querySelector('.optional-studio-eyebrow')?.textContent)
      .toBe('RECURSOS COMPLEMENTARES');
    expect(summary.querySelector('.workbench-heading-count')?.textContent)
      .toBe('03 FERRAMENTAS');
    expect(summary.querySelector('.workbench-heading strong')?.textContent)
      .toBe('Ferramentas extras');
    expect(tools.classList.contains('optional-workbench')).toBe(true);
    expect(tools.querySelector('.workbench-navigation')).not.toBeNull();
    expect(tools.querySelectorAll('.workbench-tab-number')).toHaveLength(3);
    expect(tools.querySelector('.workbench-stage')).not.toBeNull();
    const summaryAction = tools.querySelector<HTMLElement>('.optional-studio-summary-action')!;
    expect(summaryAction.textContent).toBe('Explorar');
    const toggle = summaryAction.querySelector('.workbench-toggle-icon')!;
    expect(toggle.querySelectorAll('.workbench-toggle-line')).toHaveLength(2);
    tools.open = true;
    tools.dispatchEvent(new Event('toggle'));
    expect(summaryAction.textContent).toBe('Recolher');
    expect(summaryAction.querySelector('.workbench-toggle-icon')).toBe(toggle);
    tools.open = false;
    tools.dispatchEvent(new Event('toggle'));
    expect(summaryAction.textContent).toBe('Explorar');
    expect(summaryAction.querySelector('.workbench-toggle-icon')).toBe(toggle);
    expect(tools.querySelectorAll('[aria-label="Preparar Kindle"]')).toHaveLength(0);
    expect(tools.querySelector('.optional-studio-heading small')?.textContent)
      .toBe('Leia, compare versões e edite metadados.');
    expect(tools.querySelectorAll('.workbench-tab-number')).toHaveLength(3);
    expect(tools.querySelector<HTMLButtonElement>('.optional-studio-tab-active')
      ?.getAttribute('aria-pressed')).toBe('true');
    expect(tools.querySelector('.optional-studio-tool-head')).not.toBeNull();
    const actions = Array.from(tools.querySelectorAll<HTMLButtonElement>('button'));
    expect(actions.find(button => button.textContent === 'Abrir leitura local'))
      .toBeUndefined();
    expect(tools.querySelector('.workbench-reader-launch')).toBeNull();
    expect(tools.textContent).not.toContain('Selecione um EPUB na área de envio para começar.');
    expect(tools.textContent).not.toContain('Leia capítulos, confira imagens');
    expect(tools.querySelector('.optional-studio-disclaimer')?.textContent)
      .toContain('Prévia segura: apenas estilos selecionados');
    actions.find(button => button.getAttribute('aria-label') === 'Metadados')!.click();
    const changed = root.querySelector('.optional-studio')!;
    expect(changed.querySelector('.optional-studio-tab-active')?.getAttribute('aria-label'))
      .toBe('Metadados');
  });

  it('configura Kindle Safe no fluxo principal e mantém o padrão ligado', () => {
    const state = createInitialState();
    expect(state.options.kindleSafeMode).toBe(true);
    const changes: boolean[] = [];
    const actions = {
      analyze: () => {}, repair: () => {}, copy: () => {},
      downloadTextReport: () => {}, downloadJsonReport: () => {},
      onKindleSafeChange: (enabled: boolean) => {
        changes.push(enabled);
        state.options.kindleSafeMode = enabled;
      },
    };
    let card = renderControls(state, actions);
    document.body.append(card);
    const setting = card.querySelector<HTMLInputElement>('#kindle-safe-main')!;
    expect(setting.checked).toBe(true);
    expect(card.textContent).toContain('Preparar para Kindle durante o reparo');
    expect(card.querySelector('.kindle-safe-switch-track')).not.toBeNull();
    expect(card.querySelector('.kindle-safe-main-chip')).toBeNull();

    expect(setting.disabled).toBe(false);
    setting.checked = false;
    setting.dispatchEvent(new Event('change', { bubbles: true }));
    expect(changes).toEqual([false]);
    expect(state.options.kindleSafeMode).toBe(false);
    card = renderControls(state, actions);
    expect(card.querySelector<HTMLInputElement>('#kindle-safe-main')?.checked).toBe(false);
    expect(card.querySelector('.kindle-safe-main-chip')).toBeNull();

    const options = renderOptionsPanel(state, () => {});
    expect(options.querySelector('#kindleSafeMode')).toBeNull();

    state.busy = true;
    card = renderControls(state, actions);
    expect(card.querySelector<HTMLInputElement>('#kindle-safe-main')?.disabled).toBe(true);
  });

  it('inclui a auditoria Kindle no diagnóstico com detalhes e ações originais', async () => {
    const bytes = await buildKindleIssueEpub();
    const report = await inspectEpub('integracao-kindle.epub', bytes);
    const summary = renderFileSummary(report);
    const kindle = summary.querySelector<HTMLElement>('.kindle-readiness-inline')!;
    expect(kindle).not.toBeNull();
    expect(kindle.textContent).toContain('Conferência para Kindle');
    expect(kindle.querySelector('.kindle-readiness-details')).not.toBeNull();
    expect(kindle.querySelectorAll('.kindle-readiness-item'))
      .toHaveLength(buildKindleChecks(report).length);
    expect(kindle.querySelector('a[href="https://www.amazon.com/sendtokindle"]'))
      .not.toBeNull();
    expect(Array.from(kindle.querySelectorAll('button')).some(button =>
      button.textContent === 'Baixar diagnóstico Kindle')).toBe(true);
    expect((kindle.querySelector('.kindle-readiness-details') as HTMLDetailsElement).open)
      .toBe(false);
    expect(summary.querySelector('.score-breakdown')).not.toBeNull();
    expect(summary.querySelector('.cover-summary')).not.toBeNull();
    expect(kindle.textContent).toContain('Nenhum arquivo é enviado automaticamente');
    expect(kindle.querySelector('.kindle-readiness-counts')?.textContent)
      .toContain('para revisar');
  });

  it('apresenta a conclusão com o mesmo texto e sem perder a região de status acessível', () => {
    const success = renderStatusMessage('Análise concluída no navegador.');
    expect(success).toBeDefined();
    expect(success?.classList.contains('status-ok')).toBe(true);
    expect(success?.classList.contains('status-panel')).toBe(true);
    expect(success?.getAttribute('role')).toBe('status');
    expect(success?.querySelector('.status-icon')?.getAttribute('aria-hidden'))
      .toBe('true');
    expect(success?.querySelector('.status-panel-copy strong')?.textContent)
      .toBe('Concluído com sucesso');
    expect(success?.querySelector('.status-panel-copy p')?.textContent)
      .toBe('Análise concluída no navegador.');
  });

  it('preserva o estilo e a semântica de erros, sem transformar erros em sucesso', () => {
    const error = renderStatusMessage(undefined, 'Arquivo EPUB inválido.');
    expect(error?.classList.contains('status-error')).toBe(true);
    expect(error?.classList.contains('status-ok')).toBe(false);
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.querySelector('.status-panel-copy strong')?.textContent)
      .toBe('Não foi possível concluir');
    expect(error?.querySelector('.status-panel-copy p')?.textContent)
      .toBe('Arquivo EPUB inválido.');
    expect(renderStatusMessage()).toBeUndefined();
  });

  it('apresenta leitura, comparação e metadados com a mesma estrutura visual', () => {
    const state = createInitialState();
    const root = document.createElement('div');
    document.body.append(root);
    const render = (): void => root.replaceChildren(renderOptionalEpubTools(state, render, () => {}));
    render();

    const expectations = [
      { label: 'Ler EPUB', kicker: '01 / LEITURA NO NAVEGADOR',
        title: 'Seu livro, antes de baixar', action: null },
      { label: 'Antes e depois', kicker: '02 / COMPARAÇÃO EDITORIAL',
        title: 'Veja o que realmente mudou', action: 'Comparar versões' },
      { label: 'Metadados', kicker: '03 / DADOS DA OBRA',
        title: 'Metadados sob seu controle', action: 'Carregar metadados' },
    ];
    for (const item of expectations) {
      const tab = root.querySelector<HTMLButtonElement>(
        '.optional-studio-tab[aria-label="' + item.label + '"]',
      )!;
      tab.click();
      const stage = root.querySelector('.workbench-stage')!;
      const intro = stage.querySelector('.workbench-panel-intro')!;
      expect(intro.querySelector('.optional-studio-tool-kicker')?.textContent)
        .toBe(item.kicker);
      expect(intro.querySelector('h4')?.textContent).toBe(item.title);
      if (item.action) {
        expect(Array.from(intro.querySelectorAll('button')).some(button =>
          button.textContent === item.action && button.disabled)).toBe(true);
      } else {
        expect(intro.querySelector('button')).toBeNull();
        expect(intro.querySelector('.workbench-panel-copy p')).toBeNull();
      }
      expect(root.querySelector('.optional-studio-tab-active')?.getAttribute('aria-label'))
        .toBe(item.label);
      expect(Array.from(root.querySelectorAll('.optional-studio-tab')).filter(button =>
        button.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    }
    expect(root.querySelector('.workbench-safety-notes summary')?.textContent)
      .toBe('Como tratamos os metadados');
    expect(root.querySelector('.optional-workbench')?.textContent).toContain('EPUB original');
  });

  it('permite iniciar a leitura depois de enviar um EPUB, sem botão textual redundante', () => {
    const state = createInitialState();
    state.payload = {
      file: new File(['teste'], 'teste.epub', { type: 'application/epub+zip' }),
      bytes: new Uint8Array([1, 2, 3]),
    };
    const queued: string[] = [];
    const view = renderOptionalEpubTools(state, () => {}, (label) => {
      queued.push(label);
    });
    const launch = view.querySelector<HTMLButtonElement>('.workbench-reader-launch')!;
    expect(launch).not.toBeNull();
    expect(launch.disabled).toBe(false);
    expect(launch.getAttribute('aria-label')).toBe('Abrir leitura local');
    expect(launch.getAttribute('title')).toBe('Abrir leitura local');
    expect(launch.textContent).toBe('');
    expect(launch.querySelector('.workbench-reader-launch-symbol')).not.toBeNull();
    launch.click();
    expect(queued).toEqual(['Preparar prévia EPUB']);
  });

  it('mantém um único controle de expansão e elimina CSS legado das três abas', () => {
    const state = createInitialState();
    const panel = renderOptionalEpubTools(state, () => {}, () => {});
    const toggle = panel.querySelector('.workbench-disclosure')!;
    expect(toggle.querySelectorAll('.workbench-toggle-icon')).toHaveLength(1);
    expect(toggle.querySelectorAll('.workbench-toggle-line')).toHaveLength(2);
    expect(panel.querySelectorAll('.workbench-navigation > button')).toHaveLength(3);
    expect(panel.querySelectorAll('.workbench-navigation > button[aria-pressed="true"]'))
      .toHaveLength(1);
    expect(Array.from(panel.querySelectorAll('.workbench-tab-number')).map(node =>
      node.textContent)).toEqual(['01', '02', '03']);

    const css = (file: string): string => readFileSync(
      new URL('../src/styles/' + file, import.meta.url), 'utf8');
    const workbench = css('optionalWorkbench.css');
    expect(workbench).toContain('summary.workbench-heading-row');
    expect(workbench).toContain('workbench-header-orbit');
    expect(workbench).toContain('workbench-heading-count');
    expect(workbench).not.toContain('workbench-header-stamp');
    expect(workbench).not.toContain('left: 44%');
    expect(workbench).not.toContain('left: 53%');
    expect(workbench).toContain('workbench-navigation .workbench-tab-label::before');
    expect(workbench).toContain('workbench-navigation .optional-studio-tab-active .workbench-tab-label::before');
    expect(workbench).toContain('left: -1.2rem');
    expect(workbench).toContain('left: -.78rem');
    expect(workbench).not.toContain('left: .38rem');
    expect(workbench).not.toContain('left: .24rem');
    expect(workbench).toContain('transform: translateY(0) rotate(-4deg)');
    expect(workbench).toContain('clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 76%, 0 100%)');
    expect(workbench).toContain('workbench-book-silhouette');
    expect(workbench).toContain('workbench-book-back');
    expect(workbench).toContain('workbench-book-ink');
    expect(workbench).toContain('workbench-book-spine');
    expect(workbench).toContain('workbench-book-text');
    expect(workbench).not.toContain('workbench-book-cover');
    expect(workbench).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(workbench).toContain('workbench-toggle-icon');
    expect(workbench).not.toContain('workbench-navigation .optional-studio-tab-active.btn::before');
    expect(workbench).toMatch(/optional-studio-tab\.btn::before\s*\{\s*display:\s*none;/u);
    expect(workbench).not.toContain('workbench-disclosure::after');

    for (const file of [
      'workspaceCardsPolish.css', 'cardMotionRefinement.css', 'sectionHeaderPolish.css',
    ]) {
      expect(css(file)).not.toMatch(/\.optional-studio\b/u);
    }
    for (const file of ['homeWorkspace.css', 'portfolioInspired.css']) {
      expect(css(file)).not.toMatch(/\.optional-tools\b|\.optional-tablist\b/u);
    }
  });

});
