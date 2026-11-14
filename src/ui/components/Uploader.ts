import type { AppState } from '../../app/state';
import { el, formatBytes } from '../dom';

export function renderUploader(
  state: AppState, onFile: (file: File) => void,
  onFiles?: (files: File[]) => void,
): HTMLElement {
  const input = el('input', {
    attrs: {
      type: 'file',
      accept: '.epub,application/epub+zip',
      id: 'epub-file-input',
      multiple: 'multiple',
      'aria-describedby': 'upload-help',
    },
  });
  input.className = 'visually-hidden';
  input.disabled = state.busy;

  const dropzone = el('label', {
    className: 'dropzone',
    attrs: {
      for: 'epub-file-input',
      tabindex: '0',
      role: 'button',
      'aria-label': 'Escolher ou arrastar um ou vários EPUBs para análise local',
      'aria-disabled': String(state.busy),
    },
    children: [
      renderDropIcon(),
      el('strong', {
        text: state.payload ? 'EPUB carregado com segurança' : 'Arraste um ou vários EPUBs aqui',
      }),
      el('p', {
        text: state.payload
          ? 'Você pode analisar novamente, reparar ou adicionar outros arquivos em lote'
          : 'ou clique para escolher um ou vários arquivos',
      }),
    ],
  });

  const submitFiles = (files: File[]): void => {
    if (state.busy || !files.length) return;
    if (files.length === 1) onFile(files[0]!);
    else onFiles?.(files);
  };
  input.addEventListener('change', () => {
    submitFiles(Array.from(input.files ?? []));
  });

  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (state.busy) return;
    dropzone.classList.add('dropzone-active');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dropzone-active'));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    if (state.busy) return;
    dropzone.classList.remove('dropzone-active');
    submitFiles(Array.from(event.dataTransfer?.files ?? []));
  });
  dropzone.addEventListener('keydown', (event) => {
    if (state.busy) return;
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
            text: 'Escolha um ou vários EPUBs',
            attrs: { id: 'upload-title' },
          }),
          el('p', {
            className: 'muted',
            attrs: { id: 'upload-help' },
            text: 'Um EPUB abre o fluxo individual (até 250 MB); dois ou mais abrem o ' +
              'processamento em lote, com correção opcional (até 6 EPUBs e 80 MB somados).',
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
