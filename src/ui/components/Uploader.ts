import type { AppState } from '../../app/state';
import { el, formatBytes } from '../dom';

export function renderUploader(state: AppState, onFile: (file: File) => void): HTMLElement {
  const input = el('input', {
    attrs: { type: 'file', accept: '.epub,application/epub+zip', id: 'epub-file-input' },
  });
  input.className = 'visually-hidden';

  const dropzone = el('label', {
    className: 'dropzone',
    attrs: { for: 'epub-file-input', tabindex: '0' },
    children: [
      el('span', { className: 'drop-icon', text: '📚' }),
      el('strong', { text: 'Solte seu EPUB aqui' }),
      el('p', {
        text: 'ou clique para escolher um arquivo. O processamento acontece somente no navegador.',
      }),
    ],
  });

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) onFile(file);
  });

  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('dropzone-active');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dropzone-active'));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('dropzone-active');
    const file = event.dataTransfer?.files[0];
    if (file) onFile(file);
  });
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.click();
    }
  });

  return el('section', {
    className: 'panel upload-panel',
    children: [
      input,
      dropzone,
      state.payload
        ? el('div', {
            className: 'file-pill',
            children: [
              el('span', { text: state.payload.file.name }),
              el('strong', { text: formatBytes(state.payload.file.size) }),
            ],
          })
        : el('p', {
            className: 'hint',
            text: 'Limite sugerido: até 250 MB para evitar travamentos em navegadores mais modestos.',
          }),
    ],
  });
}
