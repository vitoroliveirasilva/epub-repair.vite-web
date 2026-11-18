import type { AppState } from '../../app/state';
import { el, formatBytes } from '../dom';

export function renderUploader(
  state: AppState, onFile: (file: File) => void,
  onFiles?: (files: File[]) => void,
): HTMLElement {
  const loadedFile = state.payload?.file;
  const input = el('input', {
    className: 'visually-hidden',
    attrs: {
      type: 'file',
      accept: '.epub,application/epub+zip',
      id: 'epub-file-input',
      multiple: 'multiple',
      'aria-describedby': 'upload-help',
    },
  });
  input.disabled = state.busy;

  const dropzone = el('label', {
    className: 'dropzone upload-studio-zone upload-studio-zone-epub' +
      (loadedFile ? ' upload-studio-loaded' : '') +
      (state.busy ? ' upload-studio-busy' : ''),
    attrs: {
      for: 'epub-file-input',
      tabindex: '0',
      role: 'button',
      'aria-label': loadedFile
        ? 'Escolher outro EPUB ou vários EPUBs para processamento em lote'
        : 'Escolher ou arrastar um ou vários EPUBs para análise local',
      'aria-disabled': String(state.busy),
    },
    children: [
      el('span', { className: 'upload-studio-kicker', children: [
        el('span', { className: 'upload-studio-dot', attrs: { 'aria-hidden': 'true' } }),
        el('span', { text: state.busy ? 'Processamento em andamento' :
          loadedFile ? 'Arquivo recebido' : 'Seu arquivo, sua leitura' }),
      ] }),
      el('span', { className: 'upload-studio-graphic upload-studio-graphic-epub',
        attrs: { 'aria-hidden': 'true' }, children: [
          el('span', { className: 'upload-studio-sheet upload-studio-sheet-back' }),
          el('span', { className: 'upload-studio-sheet upload-studio-sheet-mid' }),
          el('span', { className: 'upload-studio-sheet upload-studio-sheet-front',
            children: [
              el('span', { className: 'upload-studio-lines' }),
              el('span', { className: 'upload-studio-bookmark' }),
            ],
          }),
          el('span', { className: 'upload-studio-graphic-tag', text: 'EPUB' }),
        ] }),
      el('span', { className: 'upload-studio-content', children: [
        el('strong', { className: 'upload-studio-title', text: loadedFile
          ? 'Seu livro está pronto para conferir'
          : 'Solte seu EPUB aqui' }),
        el('span', { className: 'upload-studio-subtitle', text: loadedFile
          ? 'Você pode continuar com a análise ou escolher outro arquivo.'
          : 'Ou selecione o arquivo no seu dispositivo para começar.' }),
      ] }),
      el('span', { className: 'upload-studio-action', children: [
        el('span', { text: state.busy ? 'Processando arquivo…' :
          loadedFile ? 'Escolher outro arquivo' : 'Selecionar EPUB' }),
        el('span', { className: 'upload-studio-action-arrow',
          attrs: { 'aria-hidden': 'true' }, text: '↗' }),
      ] }),
      el('span', { className: 'upload-studio-formats',
        text: 'EPUB até 250 MB  ·  selecione vários para processar em lote' }),
    ],
  });

  const submitFiles = (files: File[]): void => {
    if (state.busy || !files.length) return;
    if (files.length === 1) onFile(files[0]!);
    else onFiles?.(files);
  };
  input.addEventListener('change', () => submitFiles(Array.from(input.files ?? [])));
  for (const eventName of ['dragenter', 'dragover']) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (!state.busy) dropzone.classList.add('dropzone-active');
    });
  }
  dropzone.addEventListener('dragleave', (event) => {
    if (!dropzone.contains(event.relatedTarget as Node | null))
      dropzone.classList.remove('dropzone-active');
  });
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('dropzone-active');
    submitFiles(Array.from(event.dataTransfer?.files ?? []));
  });
  dropzone.addEventListener('keydown', (event) => {
    if (state.busy || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    input.click();
  });

  return el('section', {
    className: 'panel upload-panel upload-studio-panel',
    attrs: { id: 'upload', 'aria-labelledby': 'upload-title' },
    children: [
      el('div', { className: 'section-heading upload-studio-heading', children: [
        el('p', { className: 'eyebrow', text: '01 / ARQUIVO EPUB' }),
        el('h2', { text: 'Escolha seu EPUB', attrs: { id: 'upload-title' } }),
        el('p', { className: 'muted', text:
          'Envie um livro para verificar ou selecione vários para trabalhar em lote. Tudo fica no navegador.' }),
        el('p', { className: 'visually-hidden', attrs: { id: 'upload-help' },
          text: 'Um EPUB abre o fluxo individual (até 250 MB). Dois ou mais iniciam ' +
            'o processamento em lote, com até 6 arquivos e 80 MB somados.' }),
      ] }),
      input,
      dropzone,
      loadedFile ? el('div', { className: 'file-pill upload-studio-file',
        attrs: { role: 'status' }, children: [
          el('span', { className: 'upload-studio-file-symbol', text: 'EPUB',
            attrs: { 'aria-hidden': 'true' } }),
          el('span', { className: 'upload-studio-file-copy', children: [
            el('strong', { className: 'upload-studio-file-name', text: loadedFile.name }),
            el('small', { text: 'Arquivo selecionado no dispositivo' }),
          ] }),
          el('strong', { className: 'upload-studio-file-size',
            text: formatBytes(loadedFile.size) }),
        ] }) : undefined,
    ],
  });
}
