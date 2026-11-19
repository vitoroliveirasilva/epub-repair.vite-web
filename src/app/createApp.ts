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
import { enableCoverPreviewTilt } from '../ui/coverPreviewTilt';
import { renderStatusMessage } from '../ui/components/ErrorPanel';
import { renderFileSummary } from '../ui/components/FileSummary';
import { renderIssueList } from '../ui/components/IssueList';
import { renderOptionsPanel } from '../ui/components/OptionsPanel';
import { renderRepairSummary } from '../ui/components/RepairSummary';
import { renderUploader } from '../ui/components/Uploader';
import { button, downloadBlob, el } from '../ui/dom';
import { startHeroStarAnimation } from '../ui/heroStarAnimation';
import { setupScrollReveals } from '../ui/scrollReveals';
import { renderMobileNavigation } from '../ui/mobileNavigation';
import { renderDesktopNavigation } from '../ui/desktopNavigation';
import { renderBrandName } from '../ui/brand';
import { renderEditorialFooter } from '../ui/footer';
import {
  isBatchWorkspaceActive,
  openBatchWithFiles,
  renderBatchWorkspace,
  renderOptionalEpubTools,
  setBatchWorkspaceActive,
} from '../ui/optionalEpubTools';
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
    const scrollPosition = root.querySelector<HTMLElement>('.batch-studio-file-scroll')?.scrollTop ?? 0;
    const restoreFocus = captureFocusForRerender(root);
    render(root, state, rerender, enqueue, cancelAll);
    const fileList = root.querySelector<HTMLElement>('.batch-studio-file-scroll');
    if (fileList && scrollPosition > 0) fileList.scrollTop = scrollPosition;
    restoreFocus();
    setupScrollReveals(root);
  };
  render(root, state, rerender, enqueue, cancelAll);
  setupScrollReveals(root);
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
  const batchActive = isBatchWorkspaceActive(state);
  root.replaceChildren(
    renderAppHeader(),
    renderHero(),
    el('main', {
      className: 'layout',
      attrs: { id: 'app-workspace', tabindex: '-1' },
      children: [
        el('div', {
          className: 'workspace',
          children: [
            renderWorkspaceIntro(),
            renderWorkflowModeSelector(batchActive, state, rerender),
            batchActive ? renderBatchWorkspace(state, rerender, enqueue, cancelAll) : el('div', {
              className: 'workspace-core',
              children: [
                renderUploader(state, (file) => {
              enqueue('Carregar e analisar EPUB', (ctx) =>
                loadAndAnalyzeCandidate(file, state, ctx));
            }, (files) => {
              openBatchWithFiles(state, files);
              rerender();
              requestAnimationFrame(() =>
                root.querySelector<HTMLElement>('#batch-workspace')?.scrollIntoView({
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
              ],
            }),
            ...(!batchActive ? [
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
            ] : []),
          ],
        }),
      ],
    }),
    renderCapabilityShowcase(),
    renderSupportSections(),
    renderFooter(),
  );
  const hero = root.querySelector<HTMLElement>('.epub-home');
  if (hero) startHeroStarAnimation(hero);
  enableCoverPreviewTilt(root);
}

function renderWorkflowModeSelector(
  batchActive: boolean, state: AppState, rerender: () => void,
): HTMLElement {
  const makeBook = (className: string): HTMLElement => el('span', {
    className: `workflow-mode-book ${className}`,
    attrs: { 'aria-hidden': 'true' },
    children: [
      el('span', { className: 'workflow-mode-book-pages' }),
      el('span', { className: 'workflow-mode-book-cover', children: [
        el('span', { className: 'workflow-mode-book-decoration' }),
        el('span', { className: 'workflow-mode-book-mark' }),
      ] }),
    ],
  });

  const buildChoice = (
    batch: boolean, number: string, title: string, description: string,
  ): HTMLButtonElement => {
    const selected = batch === batchActive;
    const choice = button(
      '',
      'workflow-mode-card workflow-mode-card-' + (batch ? 'batch' : 'single') +
      (selected ? ' workflow-mode-card-active' : ''),
      () => {
        if (state.busy || selected) return;
        setBatchWorkspaceActive(state, batch);
        rerender();
      },
    );
    choice.disabled = state.busy;
    choice.setAttribute('aria-pressed', String(selected));
    choice.setAttribute('aria-label', title + '. ' + description);
    choice.append(
      el('span', {
        className: 'workflow-mode-visual',
        attrs: { 'aria-hidden': 'true' },
        children: [
          el('span', { className: 'workflow-mode-visual-orbit' }),
          batch
            ? el('span', { className: 'workflow-mode-book-stack', children: [
              makeBook('workflow-mode-book-back'),
              makeBook('workflow-mode-book-middle'),
              makeBook('workflow-mode-book-front'),
            ] })
            : makeBook('workflow-mode-book-solo'),
        ],
      }),
      el('span', { className: 'workflow-mode-content', children: [
        el('span', { className: 'workflow-mode-kicker', text: batch ? 'SUA BIBLIOTECA' : 'ATENÇÃO A CADA PÁGINA' }),
        el('strong', { className: 'workflow-mode-title', text: title }),
        el('small', { className: 'workflow-mode-description', text: description }),
      ] }),
      el('span', {
        className: 'workflow-mode-bottom',
        attrs: { 'aria-hidden': 'true' },
        children: [
          el('span', { className: 'workflow-mode-choice-text', text: selected ? 'Modo selecionado' : 'Escolher este modo' }),
          el('span', { className: 'workflow-mode-choice-arrow' }),
        ],
      }),
      el('span', { className: 'workflow-mode-number', attrs: { 'aria-hidden': 'true' }, text: number }),
    );
    return choice;
  };

  return el('section', {
    className: 'workflow-mode-selector',
    attrs: { 'aria-labelledby': 'workflow-mode-heading-title' },
    children: [
      el('div', { className: 'workflow-mode-heading', children: [
        el('h3', { text: 'Quantos livros vamos cuidar?',
          attrs: { id: 'workflow-mode-heading-title' } }),
        el('p', { text: 'Escolha um modo para ver só as opções necessárias' }),
      ] }),
      el('div', { className: 'workflow-mode-options',
        attrs: { role: 'group', 'aria-label': 'Modo de trabalho' },
        children: [
          buildChoice(false, '01', 'Um EPUB',
            'Análise detalhada, capa e reparos individuais'),
          buildChoice(true, '02–06', 'Vários EPUBs',
            'Selecione até 6 livros, processe juntos e baixe um ZIP'),
        ],
      }),
    ],
  });
}

function renderWorkspaceIntro(): HTMLElement {
  return el('section', {
    className: 'workspace-intro workspace-intro-compact',
    attrs: { 'aria-labelledby': 'workspace-intro-title' },
    children: [
      el('div', { className: 'workspace-intro-copy', children: [
        el('h2', { text: 'Estúdio de restauração',
          attrs: { id: 'workspace-intro-title' } }),
      ] }),
    ],
  });
}

function renderCapabilityShowcase(): HTMLElement {
  const capabilities = [
    ['01', 'Análise e correção',
      'Identifique problemas na estrutura do EPUB e aplique correções para melhorar sua integridade e compatibilidade.'],
    ['02', 'Capas e metadados',
      'Atualize a capa e revise informações como título, autoria, idioma e outros dados do livro.'],
    ['03', 'Leitura e comparação',
      'Visualize os capítulos e compare as versões original e corrigida para conferir as alterações.'],
    ['04', 'Compatibilidade com Kindle',
      'Verifique possíveis problemas de compatibilidade e prepare uma versão do EPUB com os ajustes necessários para o Kindle.'],
    ['05', 'Processamento em lote',
      'Analise ou corrija até seis EPUBs em uma única operação e baixe os arquivos e relatórios reunidos em um ZIP.'],
  ] as const;

  return el('section', {
    className: 'capability-showcase',
    attrs: { 'aria-labelledby': 'capability-title' },
    children: [
      el('header', {
        className: 'capability-heading',
        children: [
          el('p', { className: 'eyebrow', text: 'Recursos disponíveis' }),
          el('h2', {
            attrs: { id: 'capability-title' },
            children: [
              'Ferramentas para seus ',
              el('span', {
                className: 'capability-title-accent',
                text: 'EPUBs',
              }),
            ],
          }),
        ],
      }),
      el('div', {
        className: 'capability-ledger',
        children: capabilities.map(([number, title, description]) =>
          el('article', {
            className: 'capability-entry',
            attrs: { 'data-sequence': number },
            children: [
              el('span', { className: 'capability-number', text: number }),
              el('div', {
                children: [el('h3', { text: title }), el('p', { text: description })],
              }),
            ],
          })),
      }),
      el('a', {
        className: 'capability-link',
        text: 'Ver todas as ferramentas',
        attrs: { href: '#optional-tools' },
      }),
    ],
  });
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
    className: 'hero editorial-hero epub-home',
    attrs: { id: 'top', 'aria-label': 'EPUB Repair' },
    children: [
      el('div', {
        className: 'home-star-field',
        attrs: { 'aria-hidden': 'true' },
        children: Array.from({ length: 14 }, (_, index) =>
          el('span', {
            className: `home-star home-star-${index + 1}`,
            attrs: { 'aria-hidden': 'true' },
          })),
      }),
      el('div', {
        className: 'home-showcase',
        children: [
          el('div', {
            className: 'home-art',
            children: [
              el('span', {
                className: 'home-art-halo',
                attrs: { 'aria-hidden': 'true' },
              }),
              el('img', {
                className: 'home-mascot',
                attrs: {
                  src: '/lumina-hero.svg',
                  width: '820',
                  height: '1089',
                  alt: 'Lumina sentada, lendo um livro e segurando uma xícara de café',
                  decoding: 'async',
                  fetchpriority: 'high',
                },
              }),
            ],
          }),
          el('div', {
            className: 'home-content',
            children: [
              el('h1', {
                attrs: { 'aria-label': 'Conserte seus arquivos EPUB' },
                children: [
                  el('span', { className: 'home-title-row', text: 'Conserte seus ' }),
                  el('span', {
                    className: 'home-title-row',
                    children: [
                      el('span', { text: 'arquivos ' }),
                      el('span', { className: 'home-title-accent', text: 'EPUB' }),
                    ],
                  }),
                ],
              }),
              el('p', {
                className: 'home-subtitle',
                text: 'Analise a estrutura, corrija arquivos problemáticos e prepare seus EPUBs para Kindle e outros e-readers, diretamente no navegador',
              }),
              el('nav', {
                className: 'home-actions',
                attrs: { 'aria-label': 'Ações principais' },
                children: [
                  el('span', {
                    className: 'home-action-shell home-action-shell-repair',
                    children: [
                      el('a', {
                        className: 'home-action home-action-repair',
                        attrs: { href: '#upload' },
                        children: [
                          el('strong', { text: 'Reparar EPUB' }),
                          el('span', {
                            className: 'home-action-direction',
                            attrs: { 'aria-hidden': 'true' },
                          }),
                        ],
                      }),
                    ],
                  }),
                  el('span', {
                    className: 'home-action-shell home-action-shell-converter',
                    children: [
                      el('a', {
                        className: 'home-action home-action-converter',
                        attrs: { href: '/converter' },
                        children: [
                          el('strong', { text: 'Converter PDF' }),
                          el('span', {
                            className: 'home-action-direction',
                            attrs: { 'aria-hidden': 'true' },
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function renderEmptyState(): HTMLElement {
  return el('section', {
    className: 'panel empty-state report-welcome',
    attrs: { 'aria-labelledby': 'report-welcome-title' },
    children: [
      el('div', { className: 'report-welcome-art', attrs: { 'aria-hidden': 'true' }, children: [
        el('span', { className: 'report-welcome-art-ring' }),
        el('div', { className: 'empty-illustration', children: [
          el('span'), el('span'), el('span'),
        ] }),
        el('span', { className: 'report-welcome-art-stamp', text: 'EPUB' }),
      ] }),
      el('div', { className: 'report-welcome-copy', children: [
        el('span', { className: 'report-welcome-kicker', text: '03 / DIAGNÓSTICO' }),
        el('h2', { text: 'Envie um EPUB para começar',
          attrs: { id: 'report-welcome-title' } }),
        el('p', { className: 'report-welcome-description',
          text: 'Depois da verificação, você encontrará aqui um relatório claro, com o que está certo e o que merece atenção.' }),
        el('div', { className: 'report-welcome-highlights',
          attrs: { 'aria-label': 'Informações disponíveis no relatório' },
          children: [
            el('span', { text: 'Score Kindle' }),
            el('span', { text: 'Prioridades de correção' }),
            el('span', { text: 'Arquivos afetados' }),
          ],
        }),
        el('a', { className: 'report-welcome-link', text: 'Escolher um EPUB',
          attrs: { href: '#upload' }, children: [
            el('span', { attrs: { 'aria-hidden': 'true' }, text: '↗' }),
          ],
        }),
      ] }),
    ],
  });
}

function renderSupportSections(): HTMLElement {
  return el('section', {
    className: 'support-sections',
    attrs: { 'aria-label': 'Informações sobre privacidade e limitações' },
    children: [
      el('header', {
        className: 'support-heading',
        children: [
          el('p', { className: 'eyebrow', text: 'Clareza antes de processar' }),
          el('h2', { text: 'Seu livro continua sendo seu' }),
          el('p', {
            text: 'O EPUB Repair trabalha com limites explícitos, mantém o arquivo original ' +
              'intacto e informa quando uma decisão ainda depende de revisão humana.',
          }),
        ],
      }),
      el('article', {
        className: 'support-card support-card-local',
        attrs: { id: 'privacy' },
        children: [
          el('span', { className: 'support-index', text: 'LOCAL' }),
          el('p', { className: 'eyebrow', text: 'Privacidade' }),
          el('h2', { text: 'Processamento local sem envio para servidor' }),
          el('p', {
            className: 'muted',
            text: 'O arquivo é lido, validado, reparado e reempacotado no próprio navegador. Nenhum dado é enviado para servidor, nem mesmo o relatório. O EPUB original e o reparado permanecem no seu dispositivo.',
          }),
        ],
      }),
      el('article', {
        className: 'support-card support-card-original',
        children: [
          el('span', { className: 'support-index', text: 'CÓPIA' }),
          el('p', { className: 'eyebrow', text: 'Preservação' }),
          el('h2', { text: 'O arquivo original nunca é sobrescrito' }),
          el('p', {
            className: 'muted',
            text: 'Reparos, otimizações, metadados e nova capa geram outro arquivo. ' +
              'Você decide o que baixar e mantém o EPUB de origem como referência.',
          }),
        ],
      }),
      el('article', {
        className: 'support-card support-card-limits',
        attrs: { id: 'limitations' },
        children: [
          el('span', { className: 'support-index', text: 'LIMITE' }),
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
  return renderEditorialFooter(() => {
    applyTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark');
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
