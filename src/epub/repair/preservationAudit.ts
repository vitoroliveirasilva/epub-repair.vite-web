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
      throw new Error(`O reparo técnico modificou um recurso binário sem autorização: ${item.resolvedPath}`);
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

/** IDs e links editoriais internos não podem desaparecer por efeito colateral do sanitizer. */
function compareInternalTargets(before: string, after: string, path: string): void {
  const original = parseReadableDocument(before);
  const output = parseReadableDocument(after);
  if (!original || !output) return; // Já há alerta de comparação textual inconclusiva.
  const elements = (doc: Document): Element[] => Array.from(doc.getElementsByTagName('*'))
    .filter((element) => element.localName !== 'script' && element.localName !== 'style');
  const ids = (doc: Document) => new Set(elements(doc)
    .map((element) => element.getAttribute('id')).filter(Boolean));
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
