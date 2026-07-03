import { analyzeCurrentFile, loadFileIntoState, repairCurrentFile } from './actions';
import { createInitialState, type AppState } from './state';
import { buildJsonReport, buildTextReport, makeReportFileName } from '../ui/copyReport';
import { renderControls } from '../ui/components/Controls';
import { renderStatusMessage } from '../ui/components/ErrorPanel';
import { renderFileSummary } from '../ui/components/FileSummary';
import { renderIssueList } from '../ui/components/IssueList';
import { renderOptionsPanel } from '../ui/components/OptionsPanel';
import { renderRepairSummary } from '../ui/components/RepairSummary';
import { renderUploader } from '../ui/components/Uploader';
import { downloadBlob, el } from '../ui/dom';

type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'epub-repair-theme';

export function createApp(root: HTMLElement): void {
  initializeTheme();
  const state = createInitialState();

  const rerender = (): void => render(root, state, rerender);
  render(root, state, rerender);
}

function render(root: HTMLElement, state: AppState, rerender: () => void): void {
  root.replaceChildren(
    renderAppHeader(),
    renderHero(),
    el('main', {
      className: 'layout',
      attrs: { id: 'app-workspace' },
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
              downloadTextReport: () => {
                downloadCurrentReport(state, 'txt');
              },
              downloadJsonReport: () => {
                downloadCurrentReport(state, 'json');
              },
            }),
            renderStatusMessage(state.message, state.error),
            state.report ? renderFileSummary(state.report) : renderEmptyState(),
            state.repairResult ? renderRepairSummary(state.repairResult) : undefined,
            state.report
              ? renderIssueList(state.report, state.reportViewMode, (mode) => {
                  state.reportViewMode = mode;
                  rerender();
                })
              : undefined,
          ],
        }),
        renderOptionsPanel(state, rerender),
      ],
    }),
    renderSupportSections(),
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
    state.message = 'Relatório copiado para a área de transferência.';
    state.error = undefined;
  } catch {
    state.error = 'Não foi possível copiar o relatório. Verifique a permissão do navegador.';
  }
  rerender();
}

function downloadCurrentReport(state: AppState, format: 'txt' | 'json'): void {
  if (!state.report) return;

  const content =
    format === 'json'
      ? buildJsonReport(state.report, state.repairResult)
      : buildTextReport(state.report, state.repairResult);
  const mimeType =
    format === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8';
  downloadBlob(
    new Blob([content], { type: mimeType }),
    makeReportFileName(state.report.fileName, format),
  );
}

function renderAppHeader(): HTMLElement {
  return el('header', {
    className: 'app-header',
    children: [
      el('a', {
        className: 'brand-mark',
        attrs: { href: '#top', 'aria-label': 'EPUB Repair, início' },
        children: [renderLogoSymbol(), el('span', { text: 'EPUB Repair' })],
      }),
      el('nav', {
        className: 'header-nav',
        attrs: { 'aria-label': 'Navegação principal' },
        children: [
          el('a', { text: 'Como funciona', attrs: { href: '#privacy' } }),
          el('a', { text: 'Limitações', attrs: { href: '#limitations' } }),
          el('a', { text: 'Relatório', attrs: { href: '#app-workspace' } }),
        ],
      }),
      el('div', {
        className: 'header-actions',
        children: [
          renderThemeToggle(),
          el('a', {
            className: 'btn btn-primary btn-small',
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
    className: 'hero',
    attrs: { id: 'top' },
    children: [
      el('div', {
        className: 'hero-content',
        children: [
          el('p', { className: 'eyebrow', text: 'Validação e reparo local de EPUB' }),
          el('h1', { text: 'Conserte arquivos EPUB antes de enviar para o seu leitor.' }),
          el('p', {
            className: 'hero-copy',
            text: 'Analise a estrutura, limpe arquivos problemáticos, reconstrua pacotes e gere um EPUB mais amigável para Kindle e e-readers, direto no navegador.',
          }),
          el('div', {
            className: 'hero-actions',
            children: [
              el('a', {
                className: 'btn btn-primary btn-large',
                text: 'Selecionar EPUB',
                attrs: { href: '#upload' },
              }),
              el('a', {
                className: 'btn btn-ghost btn-large',
                text: 'Ver privacidade',
                attrs: { href: '#privacy' },
              }),
            ],
          }),
        ],
      }),
      renderHeroPreview(),
    ],
  });
}

function renderHeroPreview(): HTMLElement {
  return el('aside', {
    className: 'hero-preview',
    attrs: { 'aria-label': 'Prévia visual do relatório EPUB Repair' },
    children: [
      el('div', {
        className: 'preview-toolbar',
        children: [el('span'), el('span'), el('span'), el('strong', { text: 'Relatório local' })],
      }),
      el('div', {
        className: 'preview-score score-good',
        children: [el('span', { text: '92' }), el('small', { text: 'Kindle score' })],
      }),
      el('div', {
        className: 'preview-grid',
        children: [
          renderPreviewMetric('0', 'Fatais', 'success'),
          renderPreviewMetric('2', 'Erros', 'error'),
          renderPreviewMetric('6', 'Avisos', 'warning'),
        ],
      }),
      el('div', {
        className: 'preview-list',
        children: [
          renderPreviewLine('Manifest revisado', 'success'),
          renderPreviewLine('Capa Kindle identificada', 'info'),
          renderPreviewLine('Relatório simples e técnico', 'warning'),
        ],
      }),
    ],
  });
}

function renderPreviewMetric(value: string, label: string, tone: string): HTMLElement {
  return el('div', {
    className: `preview-metric preview-metric-${tone}`,
    children: [el('strong', { text: value }), el('small', { text: label })],
  });
}

function renderPreviewLine(text: string, tone: string): HTMLElement {
  return el('p', {
    className: `preview-line preview-line-${tone}`,
    children: [el('span'), text],
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
  return el('footer', {
    className: 'footer',
    children: [
      el('div', {
        className: 'footer-brand',
        children: [renderLogoSymbol(), el('span', { text: 'EPUB Repair' })],
      }),
      el('p', {
        children: [
          el('span', {
            text: 'Ferramenta front-end para diagnóstico, limpeza e reconstrução local de EPUBs',
          }),
          el('br'),
          el('span', { text: 'Não remove DRM e não substitui validações editoriais oficiais' }),
        ],
      }),
    ],
  });
}

function renderLogoSymbol(): HTMLElement {
  return el('span', {
    className: 'logo-symbol',
    attrs: { 'aria-hidden': 'true' },
    children: [
      el('span', { className: 'logo-fold' }),
      el('span', { className: 'logo-line logo-line-1' }),
      el('span', { className: 'logo-line logo-line-2' }),
      el('span', { className: 'logo-check' }),
    ],
  });
}

function renderThemeToggle(): HTMLElement {
  const currentTheme = getCurrentTheme();
  const toggle = el('button', {
    className: 'theme-toggle',
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
