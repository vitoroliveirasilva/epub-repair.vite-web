import type { AppState } from '../../app/state';
import { button, el, downloadBlob } from '../dom';

export function renderControls(
  state: AppState,
  actions: {
    analyze: () => void;
    repair: () => void;
    copy: () => void;
  },
): HTMLElement {
  const analyzeButton = button('Analisar EPUB', 'btn btn-secondary', actions.analyze);
  analyzeButton.disabled = !state.payload || state.busy;

  const repairButton = button('Reparar automaticamente', 'btn btn-primary', actions.repair);
  repairButton.disabled = !state.payload || state.busy || Boolean(state.report?.stats.fatalCount);

  const copyButton = button('Copiar relatório', 'btn btn-ghost', actions.copy);
  copyButton.disabled = !state.report || state.busy;

  const downloadButton = button('Baixar EPUB reparado', 'btn btn-primary', () => {
    if (state.repairResult) downloadBlob(state.repairResult.blob, state.repairResult.fileName);
  });
  downloadButton.disabled = !state.repairResult || state.busy;

  return el('section', {
    className: state.repairResult
      ? 'panel controls-panel controls-panel-ready'
      : 'panel controls-panel',
    attrs: { 'aria-busy': String(state.busy), 'aria-label': 'Ações do EPUB' },
    children: [
      el('div', {
        className: 'controls-copy',
        children: [
          el('p', { className: 'eyebrow', text: state.repairResult ? 'Download pronto' : 'Fluxo' }),
          el('h2', {
            text: state.repairResult
              ? 'Seu EPUB reparado está pronto.'
              : 'Analisar, reparar e baixar.',
          }),
          el('p', {
            className: 'muted',
            text: state.repairResult
              ? 'Baixe o arquivo reconstruído ou copie o relatório técnico para guardar o histórico do reparo.'
              : 'Comece pela análise. Se houver correções seguras, o reparo automático libera um novo pacote para download.',
          }),
        ],
      }),
      el('div', {
        className: 'control-row',
        children: [analyzeButton, repairButton, copyButton, downloadButton],
      }),
      state.busy
        ? el('div', {
            className: 'working',
            attrs: { role: 'status' },
            children: [
              el('span', { attrs: { 'aria-hidden': 'true' } }),
              'Processando estrutura do EPUB...',
            ],
          })
        : undefined,
    ],
  });
}
