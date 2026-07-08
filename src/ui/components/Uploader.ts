import type { AppState } from '../../app/state';
import { el, formatBytes } from '../dom';

export function renderUploader(state: AppState, onFile: (file: File) => void): HTMLElement {
  const input = el('input', {
    attrs: {
      type: 'file',
      accept: '.epub,application/epub+zip',
      id: 'epub-file-input',
      'aria-describedby': 'upload-help',
    },
  });
  input.className = 'visually-hidden';

  const dropzone = el('label', {
    className: 'dropzone',
    attrs: {
      for: 'epub-file-input',
      tabindex: '0',
      role: 'button',
      'aria-label': 'Escolher ou arrastar arquivo EPUB para análise local',
    },
    children: [
      renderDropIcon(),
      el('strong', {
        text: state.payload ? 'EPUB carregado com segurança' : 'Arraste seu arquivo EPUB aqui',
      }),
      el('p', {
        text: state.payload
          ? 'Você pode analisar novamente, reparar ou escolher outro arquivo quando quiser'
          : 'ou clique para escolher um arquivo',
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
    attrs: { id: 'upload', 'aria-labelledby': 'upload-title' },
    children: [
      el('div', {
        className: 'section-heading',
        children: [
          el('p', { className: 'eyebrow', text: 'Upload' }),
          el('h2', {
            text: 'Escolha o EPUB a ser alterado',
            attrs: { id: 'upload-title' },
          }),
          el('p', {
            className: 'muted',
            attrs: { id: 'upload-help' },
            text: 'Arquivos .epub são aceitos com o limite sugerido de 250 MB para evitar travamentos em navegadores mais modestos',
          }),
        ],
      }),
      input,
      dropzone,
      state.payload
        ? el('div', {
            className: 'file-pill',
            attrs: { role: 'status' },
            children: [
              el('span', { text: state.payload.file.name }),
              el('strong', { text: formatBytes(state.payload.file.size) }),
            ],
          })
        : undefined,
    ],
  });
}

function renderDropIcon(): HTMLElement {
  return el('span', {
    className: 'drop-icon',
    attrs: { 'aria-hidden': 'true' },
    children: [
      el('span', { className: 'drop-page' }),
      el('span', { className: 'drop-line drop-line-1' }),
      el('span', { className: 'drop-line drop-line-2' }),
      el('span', { className: 'drop-line drop-line-3' }),
      el('span', { className: 'drop-check' }),
    ],
  });
}
