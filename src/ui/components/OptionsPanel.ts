import type { AppState } from '../../app/state';
import { el } from '../dom';

const options = [
  [
    'kindleSafeMode',
    'Modo Kindle Safe',
    'Neutraliza recursos interativos e prioriza compatibilidade.',
  ],
  [
    'stripSystemFiles',
    'Remover lixo de sistema',
    'Remove __MACOSX, .DS_Store, Thumbs.db e similares.',
  ],
  [
    'normalizeMimetype',
    'Normalizar mimetype',
    'Escreve mimetype primeiro, sem compressão e com conteúdo exato.',
  ],
  [
    'rebuildContainer',
    'Reconstruir container.xml',
    'Garante rootfile apontando para o OPF correto.',
  ],
  [
    'repairManifest',
    'Corrigir manifest',
    'Remove itens inválidos e declara recursos existentes relevantes.',
  ],
  ['repairSpine', 'Corrigir spine', 'Remove itemrefs inválidos e reconstrói quando vazio.'],
  [
    'generateNavigation',
    'Gerar nav.xhtml quando necessário',
    'Só cria nav quando EPUB 3 precisa e não há navegação válida.',
  ],
  [
    'generateNcx',
    'Gerar toc.ncx quando necessário',
    'Cria NCX para EPUB 2 ou quando declarado e ausente.',
  ],
  ['sanitizeScripts', 'Remover scripts', 'Remove scripts, javascript: e handlers inline.'],
  [
    'removeRemoteResourceLinks',
    'Links externos viram texto',
    'Transforma links remotos em texto legível.',
  ],
  ['repairCssReferences', 'Corrigir CSS', 'Neutraliza URLs CSS remotas ou quebradas.'],
] as const;

export function renderOptionsPanel(state: AppState, onChange: () => void): HTMLElement {
  const form = el('div', { className: 'options-list' });

  for (const [key, label, description] of options) {
    const checkbox = el('input', { attrs: { type: 'checkbox', id: key } });
    checkbox.checked = Boolean(state.options[key]);
    checkbox.addEventListener('change', () => {
      state.options[key] = checkbox.checked;
      onChange();
    });

    form.append(
      el('label', {
        className: 'option-item',
        attrs: { for: key },
        children: [
          checkbox,
          el('span', {
            children: [el('strong', { text: label }), el('small', { text: description })],
          }),
        ],
      }),
    );
  }

  return el('aside', {
    className: 'sidebar',
    children: [
      el('section', {
        className: 'panel',
        children: [
          el('p', { className: 'eyebrow', text: 'Privacidade' }),
          el('h2', { text: 'Local' }),
          el('p', {
            className: 'muted',
            text: 'O EPUB é lido, validado, reparado e reempacotado no navegador.',
          }),
        ],
      }),
      el('section', {
        className: 'panel',
        children: [
          el('p', { className: 'eyebrow', text: 'Opções' }),
          el('h2', { text: 'Reparo automático' }),
          form,
        ],
      }),
    ],
  });
}
