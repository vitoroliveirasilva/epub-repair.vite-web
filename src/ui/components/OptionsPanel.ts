import type { RepairOptions } from '../../epub';
import type { AppState } from '../../app/state';
import { el } from '../dom';

type RepairOptionDescriptor = readonly [keyof RepairOptions, string, string];

const options: readonly RepairOptionDescriptor[] = [
  [
    'kindleSafeMode',
    'Modo Kindle Safe',
    'Neutraliza recursos interativos e prioriza compatibilidade.',
  ],
  [
    'conservativeMode',
    'Modo conservador',
    'Preserva textos e recursos passivos. Scripts e URLs são removidos apenas quando suas opções de limpeza estiverem ativas.',
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
    'Remover referências externas (opcional)',
    'Desmarcado por padrão: preserva links, imagens e fontes externas. Marque somente se quiser eliminá-los.',
  ],
  ['repairCssReferences', 'Corrigir CSS', 'Corrige referências ausentes ou perigosas sem remover fontes e estilos externos legítimos.'],
  [
    'stripImageMetadata',
    'Remover metadados pessoais das imagens (opcional)',
    'Desmarcado por padrão: elimina EXIF/XMP/Photoshop quando seguro, sem recomprimir. Orientação e perfis de cor são preservados; exige confirmação.',
  ],
  [
    'replaceMissingImagesWithText',
    'Substituir imagens ausentes por texto (opcional)',
    'Desmarcado por padrão: altera visualmente o livro, substituindo cada imagem ausente por marcador textual.',
  ],
];

const expandedOptions = new WeakMap<AppState, boolean>();

export function renderOptionsPanel(state: AppState, onChange: () => void): HTMLElement {
  const form = el('div', { className: 'options-list' });

  for (const [key, label, description] of options) {
    const checkbox = el('input', { attrs: { type: 'checkbox', id: key } });
    checkbox.checked = Boolean(state.options[key]);
    checkbox.disabled = state.busy;
    checkbox.addEventListener('change', () => {
      if (state.busy) return;
      state.options[key] = checkbox.checked;
      onChange();
    });

    form.append(
      el('label', {
        className: key === 'conservativeMode' ? 'option-item option-item-featured' : 'option-item',
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

  const details = el('details', {
    className: 'panel options-panel advanced-settings',
    children: [
      el('summary', {
        children: [
          el('span', { className: 'settings-summary-copy', children: [
            el('strong', { text: 'Configurações de reparo' }),
            el('small', {
              text: 'Opcional: personalize o que pode ser corrigido automaticamente',
            }),
          ] }),
          el('span', {
            className: 'settings-disclosure',
            text: '+',
            attrs: { 'aria-hidden': 'true' },
          }),
        ],
      }),
      form,
    ],
  });
  details.open = expandedOptions.get(state) ?? false;
  details.addEventListener('toggle', () => {
    if (details.isConnected) expandedOptions.set(state, details.open);
  });
  return details;
}
