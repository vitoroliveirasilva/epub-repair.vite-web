import type { LoadedEpub } from '../model/epubTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { HTML_MEDIA_TYPES, IMAGE_MEDIA_TYPES } from '../utils/constants';
import { stripImageMetadata } from './stripImageMetadata';
import { isJpegMediaType, isProgressiveJpeg } from '../utils/kindleCompatibility';

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
  approvedMetadataCleanup: ReadonlySet<string> = new Set(),
  approvedCoverReplacement?: { path: string; bytes: Uint8Array },
  approvedJpegConversions: ReadonlySet<string> = new Set(),
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
  auditMediaOverlayPreservation(original, output, before, after);

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
    // DTBook possui book/bodymatter em vez do body XHTML. Preservar bytes
    // editoriais até haver um normalizador DTBook com auditoria própria.
    if (item.mediaType === 'application/x-dtbook+xml' && !sameBytes(oldBytes, newBytes)) {
      throw new Error('Reparo bloqueado para preservar integralmente texto e estrutura DTBook em ' + item.resolvedPath);
    }
    const oldMarkup = textDecoder.decode(oldBytes);
    const newMarkup = textDecoder.decode(newBytes);
    if (!sameBytes(oldBytes, newBytes)) {
      compareInternalTargets(oldMarkup, newMarkup, item.resolvedPath);
      compareEditorialBlocks(oldMarkup, newMarkup, item.resolvedPath);
      compareSpecialMarkup(oldMarkup, newMarkup, item.resolvedPath);
      compareTypographyPreservation(oldMarkup, newMarkup, item.resolvedPath);
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
      } else if (approvedCoverReplacement?.path === item.resolvedPath &&
          sameBytes(approvedCoverReplacement.bytes, newBytes)) {
        // A imagem da capa foi escolhida explicitamente pelo usuário.
      } else if (approvedMetadataCleanup.has(item.resolvedPath) &&
          sameBytes(stripImageMetadata(oldBytes, item.mediaType).bytes, newBytes)) {
        // Somente a transformação exata de metadados previamente autorizada.
      } else if (approvedJpegConversions.has(item.resolvedPath) &&
          isJpegMediaType(item.mediaType) && isProgressiveJpeg(oldBytes) &&
          !isProgressiveJpeg(newBytes)) {
        // Conversão JPEG com consentimento: o conversor já verificou dimensões,
        // decodificação do resultado e equivalência amostral de pixels.
        // Apenas este recurso pode divergir; spine, EPUB/OPF e texto seguem auditados.
      } else {
        throw new Error(`O reparo técnico modificou um recurso binário sem autorização: ${item.resolvedPath}`);
      }
    }
  }
  return warnings;
}


/**
 * As referências entre XHTML e SMIL são editoriais. Um reparo de EPUB,
 * que não edita narração, nunca deve reconstruí-las nem substituir bytes
 * de SMIL sem solicitação explícita e verificação de sincronização.
 */
function auditMediaOverlayPreservation(
  original: LoadedEpub,
  output: ReadonlyMap<string, Uint8Array>,
  before: PackageDocumentInfo,
  after: PackageDocumentInfo,
): void {
  const outputByPath = new Map(after.manifest.map((item) => [item.resolvedPath, item]));
  for (const item of before.manifest) {
    if (!item.exists) continue;
    const current = outputByPath.get(item.resolvedPath);
    if (item.mediaOverlay && current?.mediaOverlay !== item.mediaOverlay) {
      throw new Error('O reparo alteraria o vínculo editorial entre conteúdo e Media Overlay: ' +
        item.resolvedPath);
    }
    if (item.mediaType !== 'application/smil+xml') continue;
    const was = original.files.get(item.resolvedPath)?.bytes;
    const now = output.get(item.resolvedPath);
    if (!was || !now || !sameBytes(was, now)) {
      throw new Error('O reparo alteraria bytes de sincronização SMIL sem autorização: ' +
        item.resolvedPath);
    }
  }
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

/**
 * Preserva as escolhas de tipografia e os limites de versos/diálogos.
 * O reparo não é editor literário: tags inline e quebras explícitas já
 * existentes não podem desaparecer apenas porque o texto final é igual.
 */
function compareTypographyPreservation(before: string, after: string, path: string): void {
  const oldDoc = parseReadableDocument(before);
  const newDoc = parseReadableDocument(after);
  if (!oldDoc || !newDoc) return;
  const typographic = /^(?:em|i|strong|b|u|s|small|sup|sub|span|cite|q|blockquote|pre|code|br|wbr)$/iu;
  const nodes = (doc: Document) => Array.from(doc.getElementsByTagName('*'))
    .filter((element) => typographic.test(element.localName))
    // Um elemento dentro de script/iframe não é tipografia da obra.
    .filter((element) => !Array.from(element.getElementsByTagName('*')).some((node) =>
      ['script', 'style', 'iframe', 'object'].includes(node.localName.toLowerCase())));
  const original = nodes(oldDoc);
  const output = nodes(newDoc);
  let index = 0;
  for (const element of original) {
    const name = element.localName;
    const lang = element.getAttribute('lang') ?? element.getAttribute('xml:lang') ?? '';
    const originalClass = element.getAttribute('class') ?? '';
    const originalStyle = element.getAttribute('style')?.trim() ?? '';
    const text = (element.textContent ?? '').replace(/\s+/gu, ' ').trim();
    const exactPre = /^(?:pre|code)$/iu.test(name);
    // O CSS com URLs pode ser neutralizado por opt-in ou por ameaça real.
    // Estilos editoriais sem URL são obrigatoriamente preservados.
    const protectStyle = originalStyle && !/(?:url\s*\(|@import|expression\s*\()/iu.test(originalStyle);
    let found = false;
    for (; index < output.length; index += 1) {
      const candidate = output[index]!;
      if (candidate.localName !== name ||
          (candidate.getAttribute('lang') ?? candidate.getAttribute('xml:lang') ?? '') !== lang ||
          (candidate.getAttribute('class') ?? '') !== originalClass ||
          (protectStyle && candidate.getAttribute('style')?.trim() !== originalStyle)) {
        continue;
      }
      const afterText = (candidate.textContent ?? '').replace(/\s+/gu, ' ').trim();
      if ((exactPre && candidate.textContent !== element.textContent) ||
          (!exactPre && !containsOriginalWordsInOrder(text, afterText))) continue;
      found = true;
      index += 1;
      break;
    }
    if (!found) {
      throw new Error('O reparo removeria formatação, ênfase, espaçamento ou ' +
        'quebra de verso editorial em ' + path + ' (' + name + ').');
    }
  }
}

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

  // E-049: preservar idioma por trecho e modo de escrita vertical, inclusive
  // fora de span/ruby. Conteúdos mistos podem ter vários idiomas e direções.
  // A ordem relativa de todos os marcadores originais deve sobreviver.
  const readingMarkers = (doc: Document): string[] =>
    Array.from(doc.getElementsByTagName('*'))
      .filter((node) => !['script', 'style', 'iframe', 'object', 'embed']
        .includes(node.localName.toLowerCase()))
      .flatMap((node) => {
        const rawLang = node.getAttribute('lang') ?? '';
        const rawXmlLang = node.getAttributeNS(
          'http://www.w3.org/XML/1998/namespace', 'lang',
        ) ?? '';
        // O normalizador XHTML pode adicionar o alias ausente (lang/xml:lang).
        // Comparar o idioma efetivo, mas nunca ignorar divergência explícita.
        const lang = rawLang || rawXmlLang;
        const xmlLang = rawXmlLang || rawLang;
        const dir = node.getAttribute('dir') ?? '';
        const writingMode = (node.getAttribute('style') ?? '')
          .match(/(?:^|;)\s*(?:-epub-|-webkit-)?writing-mode\s*:\s*([^;}]*)/iu)?.[1]
          ?.trim().toLowerCase() ?? '';
        const mathVariant = node.getAttribute('mathvariant') ?? '';
        const mathDisplay = node.localName === 'math'
          ? (node.getAttribute('display') ?? '') : '';
        if (!lang && !xmlLang && !dir && !writingMode &&
            !mathVariant && !mathDisplay) return [];
        return [JSON.stringify([
          node.namespaceURI, node.localName, lang, xmlLang, dir,
          writingMode, mathVariant, mathDisplay,
        ])];
      });
  const beforeMarkers = readingMarkers(oldDoc);
  const afterMarkers = readingMarkers(newDoc);
  let cursor = 0;
  for (const marker of beforeMarkers) {
    const index = afterMarkers.indexOf(marker, cursor);
    if (index < 0) {
      throw new Error('O reparo alteraria idioma misto, variante matemática ' +
        'ou modo de escrita vertical em ' + path);
    }
    cursor = index + 1;
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
