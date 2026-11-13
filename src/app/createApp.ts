import {
  analyzeCurrentFile,
  applyCoverReplacementToCurrentFile,
  clearCoverImageFromState,
  loadCoverImageIntoState,
  loadAndAnalyzeCandidate,
  repairCurrentFile,
} from './actions';
import { createInitialState, type AppState, type ProcessingProgress } from './state';
import { captureFocusForRerender } from './focusRestoration';
import { buildRepairConsentMessage } from './repairConsent';
import { buildJsonReport, buildTextReport, createReportEvidence, makeReportFileName } from '../ui/copyReport';
import { renderControls } from '../ui/components/Controls';
import { renderCoverChanger } from '../ui/components/CoverChanger';
import { renderStatusMessage } from '../ui/components/ErrorPanel';
import { renderFileSummary } from '../ui/components/FileSummary';
import { renderIssueList } from '../ui/components/IssueList';
import { renderOptionsPanel } from '../ui/components/OptionsPanel';
import { renderRepairSummary } from '../ui/components/RepairSummary';
import { renderUploader } from '../ui/components/Uploader';
import { button, downloadBlob, el } from '../ui/dom';
import { renderMobileNavigation } from '../ui/mobileNavigation';
import { renderDesktopNavigation } from '../ui/desktopNavigation';
import { renderBrandName } from '../ui/brand';
import { openBatchWithFiles, renderOptionalEpubTools } from '../ui/optionalEpubTools';
import { abortProcessingError } from './zipWorkerClient';
import { SerialTaskQueue } from './taskQueue';

type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'epub-repair-theme';

export function createApp(root: HTMLElement): void {
  initializeTheme();
  const state = createInitialState();
  const queue = new SerialTaskQueue((pending) => {
    state.pendingTasks = pending;
    state.hasPendingMutation = queue.hasPendingMutation;
    rerender();
  });
  const enqueue = (
    label: string,
    task: (context: {
      signal: AbortSignal;
      onProgress: (progress: ProcessingProgress) => void;
    }) => Promise<void>,
  ): void => {
    const accepted = queue.enqueue({
      label,
      run: async () => {
        state.activeTask = label;
        try {
          await runAsync(state, rerender, task);
        } finally {
          state.activeTask = undefined;
        }
      },
    });
    if (!accepted) {
      state.message = 'Fila cheia: aguarde ou cancele tarefas agendadas.';
      rerender();
    }
  };
  const cancelAll = (): void => {
    const discarded = queue.clearPending();
    state.processingProgress = { phase: 'Interrompendo operação...' };
    state.processingController?.abort();
    state.message = discarded
      ? discarded + ' tarefa(s) pendente(s) cancelada(s) junto da operação ativa.'
      : undefined;
    rerender();
  };
  const rerender = (): void => {
    const restoreFocus = captureFocusForRerender(root);
    render(root, state, rerender, enqueue, cancelAll);
    restoreFocus();
  };
  render(root, state, rerender, enqueue, cancelAll);
}

function render(
  root: HTMLElement, state: AppState, rerender: () => void,
  enqueue: (
    label: string,
    task: (context: {
      signal: AbortSignal;
      onProgress: (progress: ProcessingProgress) => void;
    }) => Promise<void>,
  ) => void,
  cancelAll: () => void,
): void {
  root.replaceChildren(
    renderAppHeader(),
    renderHero(),
    renderEditorialPaths(),
    el('main', {
      className: 'layout',
      attrs: { id: 'app-workspace', tabindex: '-1' },
      children: [
        el('div', {
          className: 'workspace',
          children: [
            renderUploader(state, (file) => {
              enqueue('Carregar e analisar EPUB', (ctx) =>
                loadAndAnalyzeCandidate(file, state, ctx));
            }, (files) => {
              openBatchWithFiles(state, files);
              rerender();
              requestAnimationFrame(() =>
                document.querySelector('.optional-tools')?.scrollIntoView({
                  behavior: 'smooth', block: 'start',
                }));
            }),
            renderControls(state, {
              analyze: () => {
                enqueue('Verificar EPUB', (ctx) => analyzeCurrentFile(state, ctx));
              },
              repair: () => {
                const question = buildRepairConsentMessage(state.options, state.report);
                if (question) {
                  if (!window.confirm(question)) {
                    state.message = 'Operação cancelada. O EPUB original permanece inalterado.';
                    rerender();
                    return;
                  }
                }
                enqueue('Reparar EPUB', (ctx) => repairCurrentFile(state, ctx));
              },
              copy: () => {
                void copyCurrentReport(state, rerender);
              },
              downloadTextReport: () => {
                void downloadCurrentReport(state, 'txt');
              },
              downloadJsonReport: () => {
                void downloadCurrentReport(state, 'json');
              },
              cancel: cancelAll,

            }),
            renderCoverChanger(state, {
              selectCoverImage: (file) => {
                enqueue('Selecionar capa', (ctx) =>
                  loadCoverImageIntoState(file, state, ctx.signal));
              },
              clearCoverImage: () => {
                clearCoverImageFromState(state);
                rerender();
              },
              applyCoverReplacement: () => {
                if (!state.coverImage) return;
                const current = state.report?.cover?.exists;
                const question = current
                  ? 'A capa atual será substituída por ' + state.coverImage.fileName +
                    '. A obra original não será alterada. Deseja criar uma nova cópia?'
                  : 'Uma nova capa será inserida: ' + state.coverImage.fileName +
                    '. Deseja criar uma nova cópia do EPUB?';
                if (!window.confirm(question)) {
                  state.message = 'Troca de capa cancelada; a obra original continua intacta.';
                  rerender();
                  return;
                }
                enqueue('Substituir capa', (ctx) =>
                  applyCoverReplacementToCurrentFile(state, ctx.signal, ctx.onProgress));
              },
            }),
            renderStatusMessage(state.message, state.error),
            state.invalidUploadReport
              ? renderRejectedUploadReport(state.invalidUploadReport, state.reportViewMode,
                (mode) => { state.reportViewMode = mode; rerender(); })
              : undefined,
            state.report ? renderFileSummary(state.report) : renderEmptyState(),
            state.repairResult ? renderRepairSummary(state.repairResult) : undefined,
            state.report
              ? renderIssueList(state.report, state.reportViewMode, (mode) => {
                  state.reportViewMode = mode;
                  rerender();
                })
              : undefined,
            renderOptionalEpubTools(state, rerender, enqueue),
            renderOptionsPanel(state, rerender),
          ],
        }),
      ],
    }),
    renderSupportSections(),
    renderFooter(),
  );
}




export function renderRejectedUploadReport(
  report: NonNullable<AppState['invalidUploadReport']>,
  mode: AppState['reportViewMode'],
  onModeChange: (mode: AppState['reportViewMode']) => void,
): HTMLElement {
  const exportRejected = (format: 'txt' | 'json'): void => {
    const content = format === 'json'
      ? buildJsonReport(report)
      : buildTextReport(report);
    const filename = makeReportFileName(report.fileName.replace(/\.epub$/iu,
      '-upload-recusado.epub'), format);
    downloadBlob(new Blob([content], {
      type: format === 'json'
        ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8',
    }), filename);
  };
  return el('section', {
    className: 'panel',
    attrs: { 'aria-label': 'Diagnóstico do novo EPUB recusado' },
    children: [
      el('h2', { text: 'Diagnóstico do novo EPUB recusado' }),
      el('p', { className: 'muted',
        text: 'Este relatório pertence apenas ao novo arquivo recusado. ' +
          'A cópia anterior e seu download continuam disponíveis.' }),
      el('div', { className: 'technical-report-actions', children: [
        button('Baixar TXT do EPUB recusado', 'btn btn-ghost', () => exportRejected('txt')),
        button('Baixar JSON do EPUB recusado', 'btn btn-ghost', () => exportRejected('json')),
      ] }),
      renderFileSummary(report),
      renderIssueList(report, mode, onModeChange),
    ],
  });
}

async function runAsync(
  state: AppState,
  rerender: () => void,
  task: (context: {
    signal: AbortSignal;
    onProgress: (progress: ProcessingProgress) => void;
  }) => Promise<void>,
): Promise<void> {
  
  if (state.busy) return;
  const controller = new AbortController();
  let lastProgressKey = '';
  try {
    state.error = undefined;
    state.busy = true;
    state.processingController = controller;
    state.processingProgress = { phase: 'Preparando operação local...' };
    rerender();
    await task({
      signal: controller.signal,
      onProgress: (progress) => {
        if (controller.signal.aborted) return;
        const fraction = progress.total && progress.completed !== undefined
          ? Math.floor((progress.completed / progress.total) * 20) : undefined;
        const key = progress.phase + '|' + (fraction ?? '');
        if (key === lastProgressKey) return;
        lastProgressKey = key;
        state.processingProgress = progress;
        rerender();
      },
    });
    if (controller.signal.aborted) throw abortProcessingError();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      state.message = 'Operação cancelada. Nenhum resultado parcial foi publicado.';
      state.error = undefined;
    } else {
      state.error = error instanceof Error ? error.message : 'Não foi possível concluir a ação.';
    }
  } finally {
    state.busy = false;
    state.processingController = undefined;
    state.processingProgress = undefined;
    rerender();
  }
}

async function copyCurrentReport(state: AppState, rerender: () => void): Promise<void> {
  if (!state.report) return;
  try {
    const evidence = await createEvidenceForReport(state);
    await navigator.clipboard.writeText(buildTextReport(state.report, state.repairResult, evidence));
    state.message = 'Relatório copiado para a área de transferência.';
    state.error = undefined;
  } catch {
    state.error = 'Não foi possível copiar o relatório. Verifique a permissão do navegador.';
  }
  rerender();
}

async function downloadCurrentReport(state: AppState, format: 'txt' | 'json'): Promise<void> {
  if (!state.report) return;
  const evidence = await createEvidenceForReport(state);
  const content =
    format === 'json'
      ? buildJsonReport(state.report, state.repairResult, evidence)
      : buildTextReport(state.report, state.repairResult, evidence);
  const mimeType =
    format === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8';
  downloadBlob(
    new Blob([content], { type: mimeType }),
    makeReportFileName(state.report.fileName, format),
  );
}

async function createEvidenceForReport(state: AppState) {
  const original = state.originalSource ?? (state.payload
    ? { fileName: state.payload.file.name, bytes: state.payload.bytes }
    : undefined);
  return original
    ? createReportEvidence(original.fileName, original.bytes, state.options, state.lastRepairOptions)
    : undefined;
}

function renderAppHeader(): HTMLElement {
  return el('header', {
    className: 'app-header',
    children: [
      el('a', {
        className: 'brand-mark',
        attrs: { href: '/', 'aria-label': 'EPUB Repair, início' },
        children: [renderLogoSymbol(), renderBrandName()],
      }),
      renderDesktopNavigation([
        { label: 'Reparar EPUB', href: '/', current: true },
        { label: 'Converter PDF', href: '/converter' },
        { label: 'Como funciona', href: '#privacy' },
        { label: 'Limitações', href: '#limitations' },
        { label: 'Relatório', href: '#app-workspace' },
      ]),
      renderMobileNavigation('repair'),
      el('div', {
        className: 'header-actions',
        children: [
          renderThemeToggle(),
          el('a', {
            className: 'btn btn-primary btn-small nav-primary-action',
            text: 'Validar EPUB',
            attrs: { href: '#upload' },
          }),
        ],
      }),
    ],
  });
}

function renderHero(): HTMLElement {
  return el('section', {
    className: 'hero editorial-hero',
    attrs: { id: 'top', 'aria-label': 'EPUB Repair' },
    children: [
      el('div', {
        className: 'hero-illustration',
        children: [
          el('span', { className: 'hero-illustration-shape', attrs: { 'aria-hidden': 'true' } }),
          el('img', {
            className: 'hero-mascot',
            attrs: {
              src: '/lumina-hero.svg',
              width: '410',
              height: '545',
              alt: 'Lumina, mascote do EPUB Repair, lendo um livro',
              fetchpriority: 'high',
              decoding: 'async',
            },
          }),
        ],
      }),
      el('div', {
        className: 'hero-content',
        children: [
          el('h1', { children: [
            'Prepare seus livros digitais com ',
            el('span', { className: 'hero-emphasis', text: 'qualidade' }),
          ] }),
          el('div', {
            className: 'hero-actions',
            children: [
              el('a', {
                className: 'btn btn-primary btn-large',
                text: 'Reparar EPUB',
                attrs: { href: '#upload' },
              }),
              el('a', {
                className: 'btn btn-ghost btn-large',
                text: 'PDF → EPUB',
                attrs: { href: '/converter' },
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function renderEditorialPaths(): HTMLElement {
  return el('nav', {
    className: 'editorial-paths',
    attrs: { 'aria-label': 'Escolha sua ferramenta' },
    children: [
      el('a', {
        className: 'editorial-path editorial-path-repair',
        attrs: { href: '#upload' },
        children: [
          el('span', { className: 'editorial-path-label', text: 'EPUB' }),
          el('strong', { text: 'Reparar EPUB' }),
          el('span', { text: 'Corrija a estrutura e prepare seu livro para leitura.' }),
          el('span', { className: 'editorial-path-arrow', text: '↗', attrs: { 'aria-hidden': 'true' } }),
        ],
      }),
      el('a', {
        className: 'editorial-path editorial-path-pdf',
        attrs: { href: '/converter' },
        children: [
          el('span', { className: 'editorial-path-label', text: 'PDF → EPUB' }),
          el('strong', { text: 'Converter PDF em EPUB' }),
          el('span', { text: 'Transforme documentos em livros digitais organizados.' }),
          el('span', { className: 'editorial-path-arrow', text: '↗', attrs: { 'aria-hidden': 'true' } }),
        ],
      }),
    ],
  });
}

function renderEmptyState(): HTMLElement {
  return el('section', {
    className: 'panel empty-state',
    children: [
      el('div', {
        className: 'empty-illustration',
        attrs: { 'aria-hidden': 'true' },
        children: [el('span'), el('span'), el('span')],
      }),
      el('div', {
        children: [
          el('p', { className: 'eyebrow', text: 'Relatório' }),
          el('h2', { text: 'Envie um EPUB para começar' }),
          el('p', {
            className: 'muted',
            text: 'O diagnóstico aparecerá aqui com score Kindle, severidades, arquivos afetados e detalhes técnicos recolhidos para não poluir a leitura.',
          }),
        ],
      }),
    ],
  });
}

function renderSupportSections(): HTMLElement {
  return el('section', {
    className: 'support-sections',
    attrs: { 'aria-label': 'Informações sobre privacidade e limitações' },
    children: [
      el('article', {
        className: 'support-card',
        attrs: { id: 'privacy' },
        children: [
          el('p', { className: 'eyebrow', text: 'Privacidade' }),
          el('h2', { text: 'Processamento local sem envio para servidor' }),
          el('p', {
            className: 'muted',
            text: 'O arquivo é lido, validado, reparado e reempacotado no próprio navegador. Nenhum dado é enviado para servidor, nem mesmo o relatório. O EPUB original e o reparado permanecem no seu dispositivo.',
          }),
        ],
      }),
      el('article', {
        className: 'support-card',
        attrs: { id: 'limitations' },
        children: [
          el('p', { className: 'eyebrow', text: 'Limitações' }),
          el('h2', { text: 'Transparente sobre o que é possível fazer' }),
          el('p', {
            className: 'muted',
            text: 'A ferramenta não remove DRM, não altera direitos autorais e não recupera arquivos irremediavelmente corrompidos. Focamos em organizar, validar e reconstruir apenas o que é tecnicamente viável e seguro reparar.',
          }),
        ],
      }),
    ],
  });
}

function renderFooter(): HTMLElement {
  const currentYear = new Date().getFullYear();

  return el('footer', {
    className: 'footer app-footer',
    children: [
      el('div', {
        className: 'footer-main',
        children: [
          el('div', {
            className: 'footer-brand-block',
            children: [
              el('a', {
                className: 'footer-brand',
                attrs: { href: '#top', 'aria-label': 'EPUB Repair, voltar ao início' },
                children: [renderLogoSymbol(), renderBrandName()],
              }),
            ],
          }),
          el('nav', {
            className: 'footer-links',
            attrs: { 'aria-label': 'Links de navegação e projeto' },
            children: [
              renderFooterLink('Desenvolvedor', 'https://github.com/vitoroliveirasilva', true),
              renderFooterLink(
                'Projeto no GitHub',
                'https://github.com/vitoroliveirasilva/epub-repair.vite-web',
                true,
              ),
              renderFooterLink('Reparar EPUB', '/', false),
              renderFooterLink('Converter PDF', '/converter', false),
            ],
          }),
        ],
      }),
      el('div', {
        className: 'footer-bottom',
        children: [
          el('span', { text: `© ${currentYear} Vitor Oliveira Silva` }),
          el('span', { text: 'Feito para leitores, dispositivos de leitura e arquivos EPUB.' }),
        ],
      }),
    ],
  });
}

function renderFooterLink(text: string, href: string, external = false): HTMLElement {
  return el('a', {
    text,
    attrs: external ? { href, target: '_blank', rel: 'noreferrer noopener' } : { href },
  });
}

function renderLogoSymbol(): HTMLElement {
  return el('img', {
    className: 'brand-icon',
    attrs: {
      src: '/favicon.svg',
      alt: '',
      width: '44',
      height: '44',
      decoding: 'async',
      'aria-hidden': 'true',
    },
  });
}

function renderThemeToggle(): HTMLElement {
  const currentTheme = getCurrentTheme();
  const toggle = el('button', {
    className: 'theme-toggle nav-theme-toggle',
    attrs: { type: 'button', 'aria-label': 'Alternar tema claro e escuro' },
    children: [
      el('span', { attrs: { 'aria-hidden': 'true' } }),
      el('strong', { text: currentTheme === 'dark' ? 'Escuro' : 'Claro' }),
    ],
  });

  toggle.addEventListener('click', () => {
    const nextTheme: ThemeMode = getCurrentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    const label = toggle.querySelector('strong');
    if (label) label.textContent = nextTheme === 'dark' ? 'Escuro' : 'Claro';
  });

  return toggle;
}

function initializeTheme(): void {
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === 'light' || storedTheme === 'dark') {
    applyTheme(storedTheme);
    return;
  }

  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light', false);
}

function getCurrentTheme(): ThemeMode {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme: ThemeMode, persist = true): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#111817' : '#F7F3EA');

  if (persist) window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}
