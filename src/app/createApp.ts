import { analyzeCurrentFile, loadFileIntoState, repairCurrentFile } from './actions';
import { createInitialState, type AppState } from './state';
import { buildTextReport } from '../ui/copyReport';
import { renderControls } from '../ui/components/Controls';
import { renderStatusMessage } from '../ui/components/ErrorPanel';
import { renderFileSummary } from '../ui/components/FileSummary';
import { renderIssueList } from '../ui/components/IssueList';
import { renderOptionsPanel } from '../ui/components/OptionsPanel';
import { renderRepairSummary } from '../ui/components/RepairSummary';
import { renderUploader } from '../ui/components/Uploader';
import { el } from '../ui/dom';

export function createApp(root: HTMLElement): void {
  const state = createInitialState();

  const rerender = (): void => render(root, state, rerender);
  render(root, state, rerender);
}

function render(root: HTMLElement, state: AppState, rerender: () => void): void {
  root.replaceChildren(
    renderHero(),
    el('main', {
      className: 'layout',
      children: [
        el('div', {
          className: 'workspace',
          children: [
            renderUploader(state, (file) => {
              void runAsync(state, rerender, async () => {
                await loadFileIntoState(file, state);
                await analyzeCurrentFile(state);
              });
            }),
            renderControls(state, {
              analyze: () => {
                void runAsync(state, rerender, () => analyzeCurrentFile(state));
              },
              repair: () => {
                void runAsync(state, rerender, () => repairCurrentFile(state));
              },
              copy: () => {
                void copyCurrentReport(state, rerender);
              },
            }),
            renderStatusMessage(state.message, state.error),
            state.report ? renderFileSummary(state.report) : renderEmptyState(),
            state.repairResult ? renderRepairSummary(state.repairResult) : undefined,
            state.report ? renderIssueList(state.report.issues) : undefined,
          ],
        }),
        renderOptionsPanel(state, rerender),
      ],
    }),
    renderFooter(),
  );
}

async function runAsync(
  state: AppState,
  rerender: () => void,
  task: () => Promise<void>,
): Promise<void> {
  try {
    state.error = undefined;
    state.busy = true;
    rerender();
    await task();
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Não foi possível concluir a ação.';
  } finally {
    state.busy = false;
    rerender();
  }
}

async function copyCurrentReport(state: AppState, rerender: () => void): Promise<void> {
  if (!state.report) return;
  try {
    await navigator.clipboard.writeText(buildTextReport(state.report, state.repairResult));
    state.message = 'Relatório copiado.';
    state.error = undefined;
  } catch {
    state.error = 'Não foi possível copiar o relatório. Verifique a permissão do navegador.';
  }
  rerender();
}

function renderHero(): HTMLElement {
  return el('header', {
    className: 'hero',
    children: [
      el('div', {
        children: [
          el('p', { className: 'eyebrow', text: 'EPUB Repair' }),
          el('h1', { text: 'Repare EPUBs para Kindle.' }),
          el('p', {
            className: 'hero-copy',
            text: 'Valide referências quebradas e gere um EPUB reempacotado.',
          }),
        ],
      }),
      el('section', {
        className: 'privacy-card',
        children: [
          el('strong', { text: 'Processamento local, sem servidores ou serviços externos.' }),
          el('p', {
            text: 'O arquivo é processado no navegador.',
          }),
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
        children: [
          el('h2', { text: 'Envie um EPUB para começar' }),
          el('p', {
            className: 'muted',
            text: 'O relatório aparecerá aqui com severidade, código, arquivo afetado e explicação.',
          }),
        ],
      }),
    ],
  });
}

function renderFooter(): HTMLElement {
  return el('footer', {
    className: 'footer',
    children: [
      el('p', {
        text: 'EPUB Repair é uma ferramenta de diagnóstico e reparo local. Logo, não removemos DRM nem substituimos o EPUBCheck oficial.',
      }),
    ],
  });
}
