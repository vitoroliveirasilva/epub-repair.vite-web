import type { LoadedEpub } from '../model/epubTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { HTML_MEDIA_TYPES, IMAGE_MEDIA_TYPES } from '../utils/constants';

const textDecoder = new TextDecoder('utf-8', { fatal: false });
const FONT_MIME = /^(?:font\/|application\/(?:font-|vnd\.ms-fontobject))/iu;

/**
 * Audita regressões estruturais e preservação de conteúdo.
 * Nunca reescreve texto editorial para tentar "corrigir" divergências.
 */
export function auditPreservation(
  original: LoadedEpub,
  output: ReadonlyMap<string, Uint8Array>,
  before: PackageDocumentInfo,
  after: PackageDocumentInfo | undefined,
): string[] {
  const warnings: string[] = [];
  if (!after) return ['Não foi possível confirmar a estrutura editorial após o reparo.'];

  const readingPaths = (pkg: PackageDocumentInfo) => pkg.spine
    .map((item) => item.manifestItem?.resolvedPath || `ausente:${item.idref}`);
  if (readingPaths(before).join('\u0000') !== readingPaths(after).join('\u0000')) {
    warnings.push('A ordem ou a composição do spine mudou: confirme manualmente a sequência dos capítulos.');
  }

  const originalReadingPaths = before.spine
    .map((item) => item.manifestItem)
    .filter((item) => item?.exists)
    .map((item) => item!.resolvedPath);
  const finalReadingPaths = new Set(
    after.spine.map((item) => item.manifestItem?.resolvedPath).filter(Boolean),
  );
  for (const path of originalReadingPaths) {
    if (!output.has(path) || !finalReadingPaths.has(path)) {
      throw new Error(`O reparo perdeu um documento da ordem de leitura: ${path}`);
    }
  }

  // Validar não só a presença, mas também a ordem e multiplicidade das páginas
  // de leitura que já existiam antes do reparo.
  const surviving = after.spine
    .map((item) => item.manifestItem?.resolvedPath)
    .filter((path): path is string => Boolean(path && originalReadingPaths.includes(path)));
  if (surviving.join('\u0000') !== originalReadingPaths.join('\u0000')) {
    throw new Error('A operação alterou a ordem ou repetição de capítulos já existentes.');
  }

  // Uma mudança invisível no valor linear pode alterar a ordem efetiva da leitura.
  // Não inferir nem alterar silenciosamente quais páginas são auxiliares.
  for (let index = 0; index < before.spine.length; index += 1) {
    const original = before.spine[index];
    const updated = after.spine[index];
    if (original?.manifestItem?.exists && updated?.manifestItem?.resolvedPath ===
        original.manifestItem.resolvedPath && original.linear !== updated.linear) {
      throw new Error('O reparo alteraria a classificação linear de um capítulo existente.');
    }
  }

  warnings.push(...auditNavigationPreservation(original, output, before));

  const changedText: string[] = [];
  const potentiallyLostText: string[] = [];
  const unverifiableText: string[] = [];
  for (const item of before.manifest) {
    if (!item.exists || !HTML_MEDIA_TYPES.has(item.mediaType)) continue;
    const oldBytes = original.files.get(item.resolvedPath)?.bytes;
    const newBytes = output.get(item.resolvedPath);
    if (!oldBytes || !newBytes) {
      changedText.push(item.resolvedPath);
      continue;
    }
    const oldMarkup = textDecoder.decode(oldBytes);
    const newMarkup = textDecoder.decode(newBytes);
    if (!sameBytes(oldBytes, newBytes)) {
      compareInternalTargets(oldMarkup, newMarkup, item.resolvedPath);
      compareEditorialBlocks(oldMarkup, newMarkup, item.resolvedPath);
      compareSpecialMarkup(oldMarkup, newMarkup, item.resolvedPath);
    }
    const oldText = extractReadableText(oldMarkup);
    const newText = extractReadableText(newMarkup);
    if (oldText === undefined || newText === undefined) {
      if (!sameBytes(oldBytes, newBytes)) unverifiableText.push(item.resolvedPath);
    } else if (oldText !== newText) {
      changedText.push(item.resolvedPath);
      if (!containsOriginalWordsInOrder(oldText, newText)) {
        potentiallyLostText.push(item.resolvedPath);
      }
    }
  }
  // Nunca baixar silenciosamente um livro quando uma sanitização omitiu texto legível.
  // Conteúdo ativo de <script>/<style> não entra na comparação.
  if (potentiallyLostText.length > 0) {
    throw new Error(
      `A correção alteraria ou removeria texto editorial em ${potentiallyLostText.length} arquivo(s): ` +
      potentiallyLostText.slice(0, 5).join(', ') +
      '. O EPUB não foi liberado; revise os capítulos antes de tentar outro reparo.',
    );
  }
  if (changedText.length > 0) {
    warnings.push(
      `Houve acréscimos ou alterações não destrutivas detectáveis em ${changedText.length} documento(s). ` +
      `Revise o texto: ${changedText.slice(0, 5).join(', ')}`,
    );
  }
  if (unverifiableText.length > 0) {
    warnings.push(
      `Não foi possível comparar o texto de ${unverifiableText.length} documento(s) modificado(s) ` +
      'por erro de parsing; revisão editorial manual necessária.',
    );
  }

  // Reparo estrutural não pode regravar imagens/fontes sem ação explícita.
  for (const item of before.manifest) {
    if (!item.exists || !(IMAGE_MEDIA_TYPES.has(item.mediaType) || FONT_MIME.test(item.mediaType))) {
      continue;
    }
    const oldBytes = original.files.get(item.resolvedPath)?.bytes;
    const newBytes = output.get(item.resolvedPath);
    if (!oldBytes || !newBytes) continue;
    if (!sameBytes(oldBytes, newBytes)) {
      if (item.mediaType === 'image/svg+xml') {
        compareSvgPreservation(textDecoder.decode(oldBytes), textDecoder.decode(newBytes),
          item.resolvedPath);
      } else {
        throw new Error(`O reparo técnico modificou um recurso binário sem autorização: ${item.resolvedPath}`);
      }
    }
  }
  return warnings;
}

function extractReadableText(markup: string): string | undefined {
  if (typeof DOMParser === 'undefined') return undefined;
  const document = new DOMParser().parseFromString(
    markup.replace(/&nbsp;/giu, '&#160;'), 'application/xhtml+xml',
  );
  if (document.getElementsByTagName('parsererror').length > 0) return undefined;
  for (const element of Array.from(document.getElementsByTagName('*'))) {
    if (element.localName === 'script' || element.localName === 'style') element.remove();
  }
  const body = Array.from(document.getElementsByTagName('*'))
    .find((element) => element.localName === 'body');
  return (body?.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
  return true;
}

/** Comparação conservadora: texto de capítulos deve permanecer legível e na mesma ordem.
 * Autoriza acréscimos (como aviso sobre imagem ausente), mas não elimina palavras originais.
 */
function containsOriginalWordsInOrder(before: string, after: string): boolean {
  const originalWords = before.trim().split(/\s+/u).filter(Boolean);
  if (originalWords.length === 0) return true;
  const afterWords = after.trim().split(/\s+/u).filter(Boolean);
  let cursor = 0;
  for (const word of afterWords) {
    if (word === originalWords[cursor]) cursor += 1;
    if (cursor === originalWords.length) return true;
  }
  return false;
}

/**
 * O texto integral não basta: fundir dois parágrafos preserva as palavras,
 * mas quebra a semântica de leitura. Conferir parágrafos, itens de lista e headings
 * na mesma sequência, permitindo apenas acréscimos dentro do bloco original.
 */
function compareEditorialBlocks(before: string, after: string, path: string): void {
  const original = parseReadableDocument(before);
  const repaired = parseReadableDocument(after);
  if (!original || !repaired) return;
  const blocks = (doc: Document) => Array.from(doc.getElementsByTagName('*'))
    .filter((element) => /^(?:p|li|h[1-6])$/iu.test(element.localName))
    .map((element) => (element.textContent ?? '').replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
  const beforeBlocks = blocks(original);
  const afterBlocks = blocks(repaired);
  let cursor = 0;
  for (const block of beforeBlocks) {
    while (cursor < afterBlocks.length &&
      !containsOriginalWordsInOrder(block, afterBlocks[cursor] ?? '')) cursor += 1;
    if (cursor >= afterBlocks.length) {
      throw new Error(`O reparo alteraria texto editorial: apagaria, fundiria ou mudaria a ordem de blocos editoriais em ${path}.`);
    }
    cursor += 1;
  }
}

/** IDs e links editoriais internos não podem desaparecer por efeito colateral do sanitizer. */
function compareInternalTargets(before: string, after: string, path: string): void {
  const original = parseReadableDocument(before);
  const output = parseReadableDocument(after);
  if (!original || !output) return; // Já há alerta de comparação textual inconclusiva.
  const elements = (doc: Document): Element[] => Array.from(doc.getElementsByTagName('*'))
    .filter((element) => element.localName !== 'script' && element.localName !== 'style');
  const ids = (doc: Document) => new Set(elements(doc)
    .flatMap((element) => [
      element.getAttribute('id'),
      element.localName === 'a' ? element.getAttribute('name') : null,
    ]).filter((value): value is string => Boolean(value)));
  const originalIds = ids(original);
  const afterIds = ids(output);
  for (const id of originalIds) {
    if (!afterIds.has(id)) {
      throw new Error(`O reparo removeria uma âncora editorial (${id}) em ${path}.`);
    }
  }
  const links = (doc: Document) => new Set(elements(doc)
    .filter((element) => element.localName === 'a')
    .map((element) => element.getAttribute('href') ?? '')
    .filter((href) => Boolean(href) && (
      href.startsWith('#') || (!/^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(href) &&
        !href.startsWith('kindle:embed:'))
    )));
  const remaining = links(output);
  for (const href of links(original)) {
    if (!remaining.has(href)) {
      throw new Error(`O reparo removeria uma remissão interna (${href}) em ${path}.`);
    }
  }
}

function parseReadableDocument(markup: string): Document | undefined {
  if (typeof DOMParser === 'undefined') return undefined;
  const doc = new DOMParser().parseFromString(
    markup.replace(/&nbsp;/giu, '&#160;'), 'application/xhtml+xml',
  );
  return doc.getElementsByTagName('parsererror').length > 0 ? undefined : doc;
}


/**
 * Referências do sumário EPUB 3 e NCX são editoriais, não enumeram o spine.
 * Nunca permitir que sanitização ou normalização silenciosamente perca links
 * que existiam antes, mesmo quando o destino original já era problemático.
 */
function auditNavigationPreservation(
  original: LoadedEpub,
  output: ReadonlyMap<string, Uint8Array>,
  before: PackageDocumentInfo,
): string[] {
  const notes: string[] = [];
  for (const item of [before.navItem, before.ncxItem]) {
    if (!item?.exists) continue;
    const oldBytes = original.files.get(item.resolvedPath)?.bytes;
    const newBytes = output.get(item.resolvedPath);
    if (!oldBytes || !newBytes) {
      throw new Error('O reparo removeria um arquivo de navegação existente: ' + item.resolvedPath);
    }
    if (sameBytes(oldBytes, newBytes)) continue;
    const oldDoc = parseReadableDocument(textDecoder.decode(oldBytes));
    const newDoc = parseReadableDocument(textDecoder.decode(newBytes));
    if (!oldDoc || !newDoc) {
      notes.push('Não foi possível comparar todos os links do índice em ' + item.resolvedPath +
        '; revise manualmente o sumário.');
      continue;
    }
    const targets = (doc: Document): string[] => Array.from(doc.getElementsByTagName('*'))
      .flatMap((node) => {
        if (node.localName === 'a') return [node.getAttribute('href') ?? ''];
        if (node.localName === 'content') return [node.getAttribute('src') ?? ''];
        return [];
      }).filter(Boolean);
    const oldTargets = targets(oldDoc);
    const newTargets = targets(newDoc);
    if (oldTargets.join('\u0000') !== newTargets.join('\u0000')) {
      throw new Error('O reparo alteraria destinos ou ordem do sumário em ' + item.resolvedPath);
    }
  }
  return notes;
}

/**
 * Proteger blocos semânticos especiais. Uma alteração em texto/estrutura MathML,
 * ruby ou direção explícita não pode ser tratada como sanitização inofensiva.
 * Marcação e estilos devem ser preservados; leitura visual real permanece pendente.
 */
function compareSpecialMarkup(before: string, after: string, path: string): void {
  const oldDoc = parseReadableDocument(before);
  const newDoc = parseReadableDocument(after);
  if (!oldDoc || !newDoc) return;
  const semantic = (doc: Document): string[] => Array.from(doc.getElementsByTagName('*'))
    .filter((node) => ['math', 'mrow', 'mi', 'mn', 'mo', 'msup', 'msub', 'mfrac',
      'ruby', 'rb', 'rt', 'rp', 'rtc', 'bdo', 'bdi'].includes(node.localName))
    .map((node) => [
      node.namespaceURI ?? '',
      node.localName,
      node.getAttribute('dir') ?? '',
      (node.textContent ?? '').replace(/\s+/gu, ' ').trim(),
    ].join('|'));
  if (semantic(oldDoc).join('\u0000') !== semantic(newDoc).join('\u0000')) {
    throw new Error('O reparo alteraria a semântica MathML/ruby/RTL em ' + path);
  }
  const directional = (doc: Document) => Array.from(doc.getElementsByTagName('*'))
    .filter((node) => Boolean(node.getAttribute('dir')?.trim()))
    .map((node) => node.localName + '|' + node.getAttribute('dir'));
  const beforeDirections = directional(oldDoc);
  const afterDirections = directional(newDoc);
  for (const direction of beforeDirections) {
    if (!afterDirections.includes(direction)) {
      throw new Error('O reparo perderia uma direção de leitura explícita em ' + path);
    }
  }
}


/**
 * SVG é XML, não binário opaco: somente elementos ativos podem desaparecer e
 * atributos de evento/URL/style podem ser neutralizados. IDs, texto, geometria
 * e os atributos estruturais de conteúdo passivo devem permanecer equivalentes.
 */
function compareSvgPreservation(before: string, after: string, path: string): void {
  const original = parseReadableDocument(before);
  const repaired = parseReadableDocument(after);
  if (!original || !repaired || original.documentElement.localName !== 'svg' ||
      repaired.documentElement.localName !== 'svg') {
    throw new Error('SVG alterado não pode ser auditado com segurança: ' + path);
  }
  const active = new Set(['script', 'foreignobject', 'iframe', 'embed', 'object',
    'animate', 'animatetransform', 'animatemotion', 'set', 'applet', 'portal',
    'frame', 'frameset']);
  const signature = (doc: Document): string[] =>
    Array.from(doc.getElementsByTagName('*'))
      .filter((node) => !active.has(node.localName.toLowerCase()))
      .map((node) => {
        const attrs = Array.from(node.attributes)
          .filter((attr) => !attr.name.toLowerCase().startsWith('on') &&
            !['style', 'href', 'xlink:href', 'src', 'data'].includes(attr.name.toLowerCase()))
          .map((attr) => [attr.name, attr.value])
          .sort((left, right) => (left[0] ?? '').localeCompare(right[0] ?? ''));
        const visible = node.localName === 'text' || node.localName === 'tspan'
          ? (node.textContent ?? '').replace(/\s+/gu, ' ').trim() : '';
        return JSON.stringify([node.namespaceURI, node.localName, attrs, visible]);
      });
  if (signature(original).join('\u0000') !== signature(repaired).join('\u0000')) {
    throw new Error('O reparo de SVG alteraria texto, geometria ou IDs editoriais em ' + path);
  }
}
