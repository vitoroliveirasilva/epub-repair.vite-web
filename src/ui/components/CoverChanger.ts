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
  applyButton.replaceChildren(
    el('span', { className: 'cover-button-apply-label', text: 'Aplicar nova capa' }),
    el('span', {
      className: 'cover-button-apply-arrow',
      attrs: { 'aria-hidden': 'true' },
      text: '↗',
    }),
  );

  const clearButton = button(
    'Remover seleção',
    'btn btn-ghost cover-button-clear',
    actions.clearCoverImage,
  );
  clearButton.disabled = !selectedCover || state.busy;
  clearButton.replaceChildren(
    el('span', { className: 'cover-button-clear-label', text: 'Remover seleção' }),
    el('span', {
      className: 'cover-button-clear-icon',
      attrs: { 'aria-hidden': 'true' },
      children: [coverStudioActionIcon('trash')],
    }),
  );

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
      selectedCover ? el('span', {
        className: 'cover-upload-received',
        attrs: { 'aria-hidden': 'true' },
        children: [
          el('span', { className: 'cover-upload-received-dot' }),
          el('span', { text: 'IMAGEM RECEBIDA' }),
        ],
      }) : undefined,
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
              ? 'Sua nova capa está pronta para conferir'
              : hasEpub ? 'Escolha a imagem da nova capa' : 'Aguardando um EPUB',
          }),
          el('small', {
            text: selectedCover
              ? 'Confira o resultado ao lado ou escolha outra imagem'
              : hasEpub
                ? 'Arraste uma imagem até aqui ou selecione no seu dispositivo'
                : 'Selecione um livro para habilitar a troca de capa',
          }),
        ],
      }),
      canChoose ? el('span', {
        className: 'cover-upload-cta',
        children: [
          el('span', { className: 'cover-upload-cta-label',
            text: selectedCover ? 'Trocar imagem' : 'Escolher imagem' }),
          el('span', { className: 'cover-upload-cta-arrow',
            attrs: { 'aria-hidden': 'true' }, text: '↗' }),
        ],
      }) : el('span', {
        className: 'cover-upload-locked-label',
        text: 'Disponível após selecionar um EPUB',
      }),
      selectedCover ? undefined : el('span', {
        className: 'cover-upload-footnote', text: 'JPG ou PNG · até 15 MB',
      }),
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
            className: 'cover-picker-card cover-studio-picker' +
              (selectedCover ? ' cover-studio-picker-received' : ''),
            children: [
              el('div', {
                className: 'cover-picker-content cover-studio-picker-heading',
                children: [
                  el('span', { className: 'cover-studio-overline', text: '01 / NOVA IMAGEM' }),
                  el('strong', { text: selectedCover
                    ? 'Sua nova capa' : 'Escolha uma imagem de capa' }),
                  selectedCover ? undefined : el('p', {
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
                    attrs: { role: 'status', 'aria-live': 'polite',
                      'aria-label': 'Nova imagem selecionada: ' +
                        selectedCover.fileName },
                    children: [
                      el('span', {
                        className: 'cover-selected-file-icon',
                        attrs: { 'aria-hidden': 'true' },
                        children: [
                          el('img', { className: 'cover-selected-file-thumbnail',
                            attrs: { src: selectedCover.previewDataUrl,
                              alt: '', loading: 'lazy', decoding: 'async' } }),
                        ],
                      }),
                      el('span', {
                        className: 'cover-selected-file-info',
                        children: [
                          el('strong', { className: 'cover-selected-file-name',
                            text: selectedCover.fileName,
                            attrs: { title: selectedCover.fileName } }),
                          el('small', { text: formatBytes(selectedCover.bytes.length) +
                            ' · Imagem selecionada' }),
                        ],
                      }),
                      el('span', { className: 'cover-selected-file-format',
                        text: selectedCover.mediaType === 'image/png' ? 'PNG' : 'JPG',
                        attrs: { 'aria-hidden': 'true' } }),
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
              el('div', {
                className: 'cover-studio-reassurance',
                attrs: { role: 'note' },
                children: [
                  el('span', {
                    className: 'cover-studio-reassurance-icon',
                    attrs: { 'aria-hidden': 'true' },
                    children: [coverStudioActionIcon('lock')],
                  }),
                  el('span', {
                    className: 'cover-studio-reassurance-content',
                    children: [
                      el('span', {
                        className: 'cover-studio-reassurance-kicker',
                        text: 'ORIGINAL PROTEGIDO',
                      }),
                      el('span', {
                        className: 'cover-studio-reassurance-copy',
                        text: 'O livro original e seu conteúdo permanecem preservados',
                      }),
                    ],
                  }),
                ],
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
                      coverStudioPreviewPlaceholderIcon(),
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


function coverStudioPreviewPlaceholderIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(ns, 'svg');
  icon.setAttribute('class', 'cover-studio-preview-placeholder-glyph');
  icon.setAttribute('viewBox', '0 0 64 64');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');

  const frame = document.createElementNS(ns, 'rect');
  frame.setAttribute('x', '9');
  frame.setAttribute('y', '9');
  frame.setAttribute('width', '46');
  frame.setAttribute('height', '46');
  frame.setAttribute('rx', '8');
  frame.setAttribute('class', 'cover-studio-preview-glyph-frame');
  icon.append(frame);

  const sun = document.createElementNS(ns, 'circle');
  sun.setAttribute('cx', '43');
  sun.setAttribute('cy', '23');
  sun.setAttribute('r', '4.4');
  sun.setAttribute('class', 'cover-studio-preview-glyph-sun');
  icon.append(sun);

  const hills = document.createElementNS(ns, 'path');
  hills.setAttribute('d', 'M15 44 27 31 35 39 42 33 49 41');
  hills.setAttribute('class', 'cover-studio-preview-glyph-hills');
  icon.append(hills);

  const spine = document.createElementNS(ns, 'path');
  spine.setAttribute('d', 'M17 10v44');
  spine.setAttribute('class', 'cover-studio-preview-glyph-spine');
  icon.append(spine);

  return icon;
}

function coverStudioActionIcon(kind: 'trash' | 'lock'): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(ns, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '1.8');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');

  const paths = kind === 'trash'
    ? [
        'M3 6h18',
        'M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6',
        'M5 6l1 14h12l1-14',
        'M10 10v7',
        'M14 10v7',
      ]
    : [
        'M7 10V7a5 5 0 0 1 10 0v3',
        'M6 10h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z',
      ];

  for (const d of paths) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    icon.append(path);
  }
  return icon;
}
