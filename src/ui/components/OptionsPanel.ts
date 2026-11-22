import type { RepairOptions } from '../../epub';
import type { AppState } from '../../app/state';
import { el } from '../dom';

type RepairOptionDescriptor = readonly [keyof RepairOptions, string, string];

const options: readonly RepairOptionDescriptor[] = [
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

type RepairGroup = {
  id: string;
  title: string;
  description: string;
  keys: readonly (keyof RepairOptions)[];
};

const groups: readonly RepairGroup[] = [
  {
    id: 'profile',
    title: 'Perfil de reparo',
    description: 'Defina como a ferramenta deve preservar o conteúdo original.',
    keys: ['conservativeMode'],
  },
  {
    id: 'structure',
    title: 'Estrutura e navegação',
    description: 'Organize os componentes internos e a navegação do EPUB.',
    keys: [
      'normalizeMimetype', 'rebuildContainer', 'repairManifest',
      'repairSpine', 'generateNavigation', 'generateNcx',
    ],
  },
  {
    id: 'cleanup',
    title: 'Limpeza e compatibilidade',
    description: 'Elimine arquivos desnecessários e corrija recursos problemáticos.',
    keys: ['stripSystemFiles', 'sanitizeScripts', 'repairCssReferences'],
  },
  {
    id: 'editorial',
    title: 'Alterações opcionais de conteúdo',
    description: 'Ative somente se desejar modificar referências, metadados de imagens ou sua apresentação.',
    keys: ['removeRemoteResourceLinks', 'stripImageMetadata', 'replaceMissingImagesWithText'],
  },
];

const expandedOptions = new WeakMap<AppState, boolean>();

export function renderOptionsPanel(state: AppState, onChange: () => void): HTMLElement {
  const activeCount = options.filter(([key]) => Boolean(state.options[key])).length;

  function renderOption([key, label, description]: RepairOptionDescriptor): HTMLElement {
    const checkbox = el('input', { attrs: { type: 'checkbox', id: key } });
    checkbox.checked = Boolean(state.options[key]);
    checkbox.disabled = state.busy;
    checkbox.addEventListener('change', () => {
      if (state.busy) return;
      const details = checkbox.closest('details');
      if (details) expandedOptions.set(state, details.open);
      state.options[key] = checkbox.checked;
      onChange();
    });

    return el('label', {
      className: key === 'conservativeMode'
        ? 'option-item option-item-featured repair-setting-item'
        : 'option-item repair-setting-item',
      attrs: { for: key },
      children: [
        el('span', {
          className: 'repair-setting-copy',
          children: [el('strong', { text: label }), el('small', { text: description })],
        }),
        el('span', {
          className: 'repair-setting-switch',
          children: [
            checkbox,
            el('span', { className: 'repair-setting-track', attrs: { 'aria-hidden': 'true' } }),
          ],
        }),
      ],
    });
  }

  const form = el('div', {
    className: 'options-list repair-settings-grid',
    children: groups.map((group) => {
      const titleId = 'repair-settings-' + group.id + '-title';
      const descriptors = group.keys.flatMap((key) => options.filter(([optionKey]) => optionKey === key));
      return el('section', {
        className: 'repair-settings-group repair-settings-group-' + group.id,
        attrs: { 'aria-labelledby': titleId },
        children: [
          el('div', {
            className: 'repair-settings-group-heading',
            children: [
              el('h3', { text: group.title, attrs: { id: titleId } }),
              el('p', { text: group.description }),
            ],
          }),
          el('div', {
            className: 'repair-settings-group-items',
            children: descriptors.map(renderOption),
          }),
        ],
      });
    }),
  });

  const details = el('details', {
    className: 'panel options-panel advanced-settings repair-settings-studio',
    children: [
      el('summary', {
        children: [
          el('span', {
            className: 'repair-settings-emblem',
            attrs: { 'aria-hidden': 'true' },
            children: [el('i'), el('i'), el('i')],
          }),
          el('span', { className: 'settings-summary-copy', children: [
            el('strong', { text: 'Configurações de reparo' }),
            el('small', {
              text: 'Opcional: personalize o que pode ser corrigido automaticamente',
            }),
          ] }),
          el('span', {
            className: 'repair-settings-count',
            children: [
              el('strong', { text: String(activeCount) + '/' + String(options.length) }),
              el('small', { text: 'opções ativas' }),
            ],
          }),
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
