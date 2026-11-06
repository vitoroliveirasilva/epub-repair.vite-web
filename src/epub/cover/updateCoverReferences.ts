import type { PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction } from '../model/repairTypes';
import { HTML_MEDIA_TYPES, CSS_MEDIA_TYPES } from '../utils/constants';
import {
  decodeCssEscapes, dirname, encodePathForXml, isRemoteUrl,
  relativePath, resolveReference, splitSrcsetCandidates,
} from '../utils/pathUtils';
import { decodeUtf8ForRewrite } from '../utils/textEncoding';
import { parseXml, serializeXmlPreservingDeclaration } from '../utils/xmlUtils';

const encoder = new TextEncoder();
const URL_ATTRIBUTES = new Set([
  'src', 'href', 'xlink:href', 'poster', 'data', 'background',
]);

/**
 * E-100: ao substituir capa por um formato diferente, não basta atualizar
 * cover-image no OPF. As páginas que exibiam o arquivo antigo precisam apontar
 * à nova imagem, sem tocar em URLs externas nem na ordem editorial.
 * Apenas recursos declarados e referências resolvidas ao caminho exato mudam.
 */
export function updateCoverReferences(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
  oldCoverPath: string,
  newCoverPath: string,
): RepairAction[] {
  if (oldCoverPath === newCoverPath) return [];
  const actions: RepairAction[] = [];
  const processed = new Set<string>();
  for (const item of pkg.manifest) {
    const path = item.resolvedPath;
    if (!item.exists || processed.has(path)) continue;
    processed.add(path);
    const bytes = files.get(path);
    if (!bytes) continue;
    if (!HTML_MEDIA_TYPES.has(item.mediaType) &&
        !CSS_MEDIA_TYPES.has(item.mediaType) &&
        item.mediaType !== 'image/svg+xml') continue;

    const original = decodeUtf8ForRewrite(bytes, path);
    let updated = original;
    if (CSS_MEDIA_TYPES.has(item.mediaType)) {
      updated = rewriteCss(original, path, oldCoverPath, newCoverPath);
    } else {
      const isHtml = item.mediaType === 'text/html';
      const doc = isHtml
        ? new DOMParser().parseFromString(original, 'text/html')
        : parseXml(original, 'application/xhtml+xml');
      let changed = false;
      for (const node of Array.from(doc.getElementsByTagName('*'))) {
        for (const attr of Array.from(node.attributes)) {
          const name = attr.name.toLowerCase();
          const value = attr.value;
          const next = name === 'srcset'
            ? rewriteSrcset(value, path, oldCoverPath, newCoverPath)
            : name === 'style'
              ? rewriteCss(value, path, oldCoverPath, newCoverPath)
              : URL_ATTRIBUTES.has(name)
                ? replaceLocalReference(value, path, oldCoverPath, newCoverPath)
                : value;
          if (next !== value) {
            node.setAttribute(attr.name, next);
            changed = true;
          }
        }
        if (node.localName.toLowerCase() === 'style') {
          const css = node.textContent ?? '';
          const next = rewriteCss(css, path, oldCoverPath, newCoverPath);
          if (next !== css) {
            node.textContent = next;
            changed = true;
          }
        }
      }
      if (changed) {
        updated = isHtml
          ? (original.match(/^\s*<!doctype[^>]*>/iu)?.[0] ?? '') +
            '\n' + doc.documentElement.outerHTML
          : serializeXmlPreservingDeclaration(doc, original);
      }
    }
    if (updated !== original) {
      files.set(path, encoder.encode(updated));
      actions.push({
        type: 'updated',
        title: 'Referência visual da capa atualizada',
        detail: 'Referências locais para a imagem antiga foram redirecionadas à nova capa; ' +
          'texto, destinos não relacionados e recursos externos foram preservados.',
        file: path,
      });
    }
  }
  return actions;
}

/** URLs do guide apontando diretamente à imagem precisam acompanhar o OPF. */
export function updateCoverGuideReference(
  opf: Document,
  opfPath: string,
  oldCoverPath: string,
  newCoverPath: string,
): boolean {
  if (oldCoverPath === newCoverPath) return false;
  let changed = false;
  for (const node of Array.from(opf.getElementsByTagName('*'))) {
    if (node.localName !== 'reference' ||
        node.parentElement?.localName !== 'guide' ||
        !(node.getAttribute('type') ?? '').toLowerCase().split(/\s+/u).includes('cover')) continue;
    const href = node.getAttribute('href');
    if (!href) continue;
    const next = replaceLocalReference(href, opfPath, oldCoverPath, newCoverPath);
    if (next !== href) {
      node.setAttribute('href', next);
      changed = true;
    }
  }
  return changed;
}

export function replaceLocalReference(
  value: string,
  referencingPath: string,
  oldCoverPath: string,
  newCoverPath: string,
): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('#') || isRemoteUrl(trimmed)) return value;
  const resolved = resolveReference(referencingPath, trimmed);
  if (!resolved.safe || resolved.path !== oldCoverPath) return value;
  const suffix = /[?#].*$/u.exec(trimmed)?.[0] ?? '';
  return encodePathForXml(relativePath(dirname(referencingPath), newCoverPath)) + suffix;
}

function rewriteSrcset(
  source: string, path: string, oldPath: string, newPath: string,
): string {
  let changed = false;
  const candidates = splitSrcsetCandidates(source).map((candidate) => {
    const match = /^(\S+)([\s\S]*)$/u.exec(candidate);
    if (!match) return candidate;
    const replacement = replaceLocalReference(match[1]!, path, oldPath, newPath);
    if (replacement === match[1]) return candidate;
    changed = true;
    return replacement + (match[2] ?? '');
  });
  return changed ? candidates.join(', ') : source;
}

function rewriteCss(
  source: string, path: string, oldPath: string, newPath: string,
): string {
  return source.replace(/url\(\s*(["']?)([^"'()]*?)\1\s*\)/giu,
    (whole, quote: string, raw: string) => {
      const value = raw.trim();
      const next = replaceLocalReference(decodeCssEscapes(value), path, oldPath, newPath);
      return next === decodeCssEscapes(value)
        ? whole
        : 'url(' + quote + next + quote + ')';
    });
}
