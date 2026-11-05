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

  const changedText: string[] = [];
  for (const item of before.manifest) {
    if (!item.exists || !HTML_MEDIA_TYPES.has(item.mediaType)) continue;
    const oldBytes = original.files.get(item.resolvedPath)?.bytes;
    const newBytes = output.get(item.resolvedPath);
    if (!oldBytes || !newBytes) {
      changedText.push(item.resolvedPath);
      continue;
    }
    const oldText = extractReadableText(textDecoder.decode(oldBytes));
    const newText = extractReadableText(textDecoder.decode(newBytes));
    if (oldText !== undefined && newText !== undefined && oldText !== newText) {
      changedText.push(item.resolvedPath);
    }
  }
  if (changedText.length > 0) {
    warnings.push(`O texto de ${changedText.length} documento(s) mudou ou foi removido; ` +
      `verifique as alterações: ${changedText.slice(0, 5).join(', ')}` +
      (changedText.length > 5 ? ', ...' : ''));
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
