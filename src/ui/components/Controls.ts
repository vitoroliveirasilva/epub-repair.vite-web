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
  const analyzeButton = button('Analisar EPUB', 'btn btn-primary', actions.analyze);
  analyzeButton.disabled = !state.payload || state.busy;

  const repairButton = button('Reparar e revalidar', 'btn btn-secondary', actions.repair);
  repairButton.disabled = !state.payload || state.busy || Boolean(state.report?.stats.fatalCount);

  const copyButton = button('Copiar relatório', 'btn btn-ghost', actions.copy);
  copyButton.disabled = !state.report || state.busy;

  const downloadButton = button('Baixar EPUB -k', 'btn btn-ghost', () => {
    if (state.repairResult) downloadBlob(state.repairResult.blob, state.repairResult.fileName);
  });
  downloadButton.disabled = !state.repairResult || state.busy;

  return el('section', {
    className: 'panel controls-panel',
    attrs: { 'aria-busy': String(state.busy) },
    children: [
      el('div', {
        className: 'control-row',
        children: [analyzeButton, repairButton, copyButton, downloadButton],
      }),
      state.busy
        ? el('p', { className: 'working', text: 'Processando...' })
        : undefined,
    ],
  });
}
