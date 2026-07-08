import type { AppState } from '../../app/state';
import { button, el, formatBytes } from '../dom';

export function renderCoverChanger(
  state: AppState,
  actions: {
    selectCoverImage: (file: File) => void;
    clearCoverImage: () => void;
    applyCoverReplacement: () => void;
  },
): HTMLElement {
  const hasFile = Boolean(state.payload);
  const hasCoverImage = Boolean(state.coverImage);
  const input = el('input', {
    className: 'cover-file-input',
    attrs: {
      type: 'file',
      accept: 'image/jpeg,image/png,.jpg,.jpeg,.png',
      'aria-label': 'Selecionar nova capa do EPUB',
    },
  });

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (file) actions.selectCoverImage(file);
  });

  const chooseButton = button('Escolher capa', 'btn btn-secondary', () => input.click());
  chooseButton.disabled = !hasFile || state.busy;

  const applyButton = button('Aplicar nova capa', 'btn btn-primary', actions.applyCoverReplacement);
  applyButton.disabled = !hasFile || !hasCoverImage || state.busy;

  const clearButton = button('Remover seleção', 'btn btn-ghost', actions.clearCoverImage);
  clearButton.disabled = !hasCoverImage || state.busy;

  return el('section', {
    className: 'panel cover-action-panel',
    attrs: { 'aria-label': 'Troca de capa do EPUB' },
    children: [
      input,
      el('div', {
        className: 'section-heading',
        children: [
          el('p', { className: 'eyebrow', text: 'Capa' }),
          el('h2', { text: 'Trocar capa do EPUB' }),
          el('p', {
            className: 'muted',
            text: coverDescription(state),
          }),
        ],
      }),
      el('div', {
        className: 'cover-action-grid',
        children: [
          el('article', {
            className: 'cover-picker-card',
            children: [
              el('strong', { text: 'Nova imagem' }),
              el('p', {
                className: 'muted',
                text: hasCoverImage
                  ? `${state.coverImage!.fileName} • ${formatBytes(state.coverImage!.bytes.length)} • ${state.coverImage!.mediaType}`
                  : 'Use JPG, JPEG ou PNG. JPEGs são normalizados quando possível para evitar perda opcional de compatibilidade.',
              }),
              state.coverImage?.normalizationNote
                ? el('small', { className: 'muted', text: state.coverImage.normalizationNote })
                : undefined,
              el('div', {
                className: 'cover-action-buttons',
                children: [chooseButton, applyButton, clearButton],
              }),
            ],
          }),
          renderCoverPreviewCard(state),
        ],
      }),
    ],
  });
}

function renderCoverPreviewCard(state: AppState): HTMLElement {
  const previewDataUrl = state.coverImage?.previewDataUrl ?? state.report?.cover?.previewDataUrl;
  const title = state.coverImage ? 'Prévia da nova capa' : 'Capa atual detectada';
  const detail = state.coverImage
    ? 'Esta imagem será aplicada quando você confirmar.'
    : (state.report?.cover?.path ?? 'Nenhuma capa atual detectada com segurança.');

  return el('article', {
    className: 'cover-preview-card',
    children: [
      previewDataUrl
        ? el('figure', {
            className: 'cover-new-preview',
            children: [
              el('img', {
                attrs: {
                  src: previewDataUrl,
                  alt: title,
                  loading: 'lazy',
                  decoding: 'async',
                },
              }),
            ],
          })
        : el('div', {
            className: 'cover-new-preview cover-new-preview-empty',
            attrs: { 'aria-hidden': 'true' },
            children: [el('span'), el('small', { text: 'Sem prévia' })],
          }),
      el('div', {
        children: [el('strong', { text: title }), el('p', { className: 'muted', text: detail })],
      }),
    ],
  });
}

function coverDescription(state: AppState): string {
  if (!state.payload) return 'Envie um EPUB primeiro para liberar a troca de capa.';
  if (state.coverImage) return 'Confira a prévia e aplique para gerar uma nova cópia do EPUB.';
  if (state.report?.stats.kindleScore === 100) {
    return 'O EPUB não precisa de correção, mas você ainda pode trocar a capa como alteração intencional.';
  }
  return 'A troca de capa é separada do reparo técnico. Ela pode substituir ou adicionar a capa oficial sem rodar correções desnecessárias.';
}
