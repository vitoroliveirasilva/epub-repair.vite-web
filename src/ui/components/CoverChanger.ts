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
  const hasEpub = Boolean(state.payload);
  const selectedCover = state.coverImage;
  const canChoose = hasEpub && !state.busy;
  const coverState = selectedCover ? 'selected' : hasEpub ? 'available' : 'locked';
  const input = el('input', {
    className: 'cover-file-input',
    attrs: {
      id: 'cover-image-input',
      type: 'file',
      accept: 'image/jpeg,image/png,.jpg,.jpeg,.png',
      'aria-label': 'Selecionar nova imagem para a capa do EPUB',
    },
  });
  input.disabled = !canChoose;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (file && canChoose) actions.selectCoverImage(file);
  });

  const applyButton = button(
    'Aplicar nova capa',
    'btn btn-primary cover-button-apply',
    actions.applyCoverReplacement,
  );
  applyButton.disabled = !canChoose || !selectedCover;

  const clearButton = button(
    'Remover seleção',
    'btn btn-ghost cover-button-clear',
    actions.clearCoverImage,
  );
  clearButton.disabled = !selectedCover || state.busy;

  const uploadZone = el('label', {
    className: 'cover-upload-zone cover-upload-zone-' + coverState +
      (!canChoose ? ' cover-upload-zone-disabled' : ''),
    attrs: {
      ...(canChoose ? { for: 'cover-image-input' } : {}),
      role: canChoose ? 'button' : 'group',
      tabindex: canChoose ? '0' : '-1',
      'aria-label': !hasEpub ? 'Selecione um EPUB para habilitar a troca de capa'
        : selectedCover ? 'Trocar a imagem de capa selecionada'
          : 'Escolher ou arrastar uma nova imagem de capa JPG ou PNG',
      'aria-disabled': String(!canChoose),
    },
    children: [
      el('span', {
        className: 'cover-upload-illustration',
        attrs: { 'aria-hidden': 'true' },
        children: [
          el('span', { className: 'cover-upload-sheet cover-upload-sheet-back' }),
          el('span', { className: 'cover-upload-sheet cover-upload-sheet-front',
            children: [
              el('span', { className: 'cover-upload-sun' }),
              el('span', { className: 'cover-upload-mountain' }),
            ],
          }),
        ],
      }),
      el('span', {
        className: 'cover-upload-text',
        children: [
          el('strong', {
            text: selectedCover
              ? 'Imagem escolhida'
              : hasEpub ? 'Arraste sua nova capa aqui' : 'Aguardando um EPUB',
          }),
          el('small', {
            text: selectedCover
              ? 'Confira a prévia ao lado ou escolha outra imagem'
              : hasEpub
                ? 'JPG ou PNG, arraste ou selecione no dispositivo'
                : 'Selecione um livro para habilitar a troca de capa',
          }),
        ],
      }),
      canChoose ? el('span', {
        className: 'cover-upload-cta',
        text: selectedCover ? 'Trocar imagem  ↗' : 'Escolher imagem  ↗',
      }) : el('span', {
        className: 'cover-upload-locked-label',
        text: 'Disponível após selecionar um EPUB',
      }),
      el('span', { className: 'cover-upload-footnote', text: 'JPG ou PNG · até 15 MB' }),
    ],
  });

  uploadZone.addEventListener('keydown', (event) => {
    if (!canChoose || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    input.click();
  });
  for (const type of ['dragenter', 'dragover']) {
    uploadZone.addEventListener(type, (event) => {
      event.preventDefault();
      if (canChoose) uploadZone.classList.add('cover-upload-zone-active');
    });
  }
  uploadZone.addEventListener('dragleave', (event) => {
    if (!uploadZone.contains(event.relatedTarget as Node | null)) {
      uploadZone.classList.remove('cover-upload-zone-active');
    }
  });
  uploadZone.addEventListener('drop', (event) => {
    event.preventDefault();
    uploadZone.classList.remove('cover-upload-zone-active');
    if (canChoose && event.dataTransfer?.files[0]) {
      actions.selectCoverImage(event.dataTransfer.files[0]);
    }
  });

  return el('section', {
    className: 'panel cover-action-panel cover-studio-panel cover-studio-' + coverState,
    attrs: { 'aria-labelledby': 'cover-studio-title' },
    children: [
      input,
      el('div', {
        className: 'section-heading cover-action-heading cover-studio-heading',
        children: [
          el('p', { className: 'eyebrow', text: 'PERSONALIZE SEU LIVRO / 02' }),
          el('h2', {
            text: 'Uma nova capa, a mesma história',
            attrs: { id: 'cover-studio-title' },
          }),
          el('p', { className: 'muted', text: coverDescription(state) }),
        ],
      }),
      el('div', {
        className: 'cover-action-grid cover-studio-grid',
        children: [
          el('article', {
            className: 'cover-picker-card cover-studio-picker',
            children: [
              el('div', {
                className: 'cover-picker-content cover-studio-picker-heading',
                children: [
                  el('span', { className: 'cover-studio-overline', text: '01 / NOVA IMAGEM' }),
                  el('strong', { text: 'Escolha uma imagem de capa' }),
                  el('p', {
                    className: 'muted',
                    text: hasEpub
                      ? 'Escolha a imagem que vai substituir a capa atual'
                      : 'Selecione um EPUB na etapa anterior para começar',
                  }),
                ],
              }),
              uploadZone,
              selectedCover
                ? el('div', {
                    className: 'cover-selected-file',
                    attrs: { role: 'status', 'aria-live': 'polite' },
                    children: [
                      el('span', {
                        className: 'cover-selected-file-icon',
                        text: selectedCover.mediaType === 'image/png' ? 'PNG' : 'JPG',
                        attrs: { 'aria-hidden': 'true' },
                      }),
                      el('div', {
                        className: 'cover-selected-file-info',
                        children: [
                          el('strong', { text: selectedCover.fileName }),
                          el('small', {
                            text: formatBytes(selectedCover.bytes.length) + ' · Imagem selecionada',
                          }),
                        ],
                      }),
                      el('span', {
                        className: 'cover-selected-file-state',
                        text: 'Pronta',
                      }),
                    ],
                  })
                : undefined,
              selectedCover?.normalizationNote
                ? el('p', {
                    className: 'cover-normalization-note',
                    text: selectedCover.normalizationNote,
                  })
                : undefined,
              el('div', {
                className: 'cover-action-buttons cover-studio-actions',
                children: [
                  applyButton,
                  selectedCover ? clearButton : undefined,
                ],
              }),
              el('p', {
                className: 'cover-studio-reassurance',
                text: 'A capa original e o texto do EPUB permanecem preservados',
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
  const selectedCover = state.coverImage;
  const previewDataUrl = selectedCover?.previewDataUrl ?? state.report?.cover?.previewDataUrl;
  const hasOriginalCover = Boolean(state.report?.cover?.previewDataUrl);
  const title = selectedCover
    ? 'Sua nova capa'
    : hasOriginalCover
      ? 'Capa atual do livro'
      : 'Prévia da capa';
  const detail = selectedCover
    ? 'Esta imagem será usada na nova cópia quando você confirmar'
    : hasOriginalCover
      ? 'Escolha outra imagem para visualizar a substituição'
      : 'A imagem escolhida aparecerá aqui antes da aplicação';

  return el('article', {
    className: 'cover-preview-card cover-studio-preview' +
      (selectedCover ? ' cover-preview-card-selected' : '') +
      (!previewDataUrl ? ' cover-studio-preview-empty' : ''),
    children: [
      el('div', {
        className: 'cover-studio-preview-header',
        children: [
          el('span', { className: 'cover-studio-overline', text: '02 / VISUALIZAÇÃO' }),
          el('span', {
            className: 'cover-studio-preview-status' +
              (selectedCover ? ' cover-studio-preview-status-ready' : ''),
            text: selectedCover ? 'Nova capa selecionada'
              : hasOriginalCover ? 'Capa original' : 'Aguardando imagem',
          }),
        ],
      }),
      el('div', {
        className: 'cover-preview-stage cover-studio-preview-stage',
        children: [
          previewDataUrl
            ? el('div', {
                className: 'cover-preview-tilt',
                children: [
                  el('figure', {
                    className: 'cover-new-preview',
                    children: [
                      el('img', {
                        attrs: {
                          src: previewDataUrl,
                          alt: selectedCover ? 'Prévia da nova imagem de capa selecionada'
                            : 'Prévia da capa original do EPUB',
                          loading: 'lazy',
                          decoding: 'async',
                        },
                      }),
                    ],
                  }),
                ],
              })
            : el('div', {
                className: 'cover-new-preview cover-new-preview-empty',
                attrs: { 'aria-hidden': 'true' },
                children: [
                  el('span', { className: 'cover-studio-preview-placeholder',
                    children: [
                      el('span', { className: 'cover-studio-preview-placeholder-lines' }),
                    ] }),
                ],
              }),
        ],
      }),
      el('div', {
        className: 'cover-preview-copy cover-studio-preview-copy',
        children: [
          el('strong', { text: title }),
          el('p', { className: 'muted', text: detail }),
        ],
      }),
    ],
  });
}

function coverDescription(state: AppState): string {
  if (!state.payload) return 'Envie um EPUB para escolher uma nova capa e visualizar o resultado';
  if (state.coverImage) return 'Confira a prévia e aplique a nova capa quando estiver satisfeito';
  return 'Escolha uma imagem, confira a prévia e crie uma nova cópia do seu EPUB';
}
