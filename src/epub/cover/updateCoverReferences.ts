import type { PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction } from '../model/repairTypes';
import { HTML_MEDIA_TYPES, CSS_MEDIA_TYPES } from '../utils/constants';
import {
  basename, decodeCssEscapes, dirname, encodePathForXml, isRemoteUrl,
  relativePath, resolveReference, splitSrcsetCandidates,
} from '../utils/pathUtils';
import { decodeUtf8ForRewrite } from '../utils/textEncoding';
import { parseXml, serializeXmlPreservingDeclaration } from '../utils/xmlUtils';

const encoder = new TextEncoder();
const URL_ATTRIBUTES = new Set([
  'src', 'href', 'xlink:href', 'poster', 'data', 'background',
]);







export function updateCoverReferences(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
  oldCoverPath: string,
  newCoverPath: string,
  allowedPaths?: ReadonlySet<string>,
): RepairAction[] {
  if (oldCoverPath === newCoverPath) return [];
  const actions: RepairAction[] = [];
  const processed = new Set<string>();
  for (const item of pkg.manifest) {
    const path = item.resolvedPath;
    if (!item.exists || processed.has(path) ||
        (allowedPaths && !allowedPaths.has(path))) continue;
    processed.add(path);
    const bytes = files.get(path);
    if (!bytes) continue;
    if (!HTML_MEDIA_TYPES.has(item.mediaType) &&
        !CSS_MEDIA_TYPES.has(item.mediaType) &&
        item.mediaType !== 'image/svg+xml') continue;

    
    
    const candidate = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const filename = basename(oldCoverPath);
    const encoded = encodeURIComponent(filename);
    const cssDecoded = candidate.includes('\\') ? decodeCssEscapes(candidate) : candidate;
    
    const comparable = cssDecoded.replace(/%[0-9a-f]{2}/giu, (hex) => hex.toUpperCase());
    if (!comparable.includes(filename) && !comparable.includes(encoded)) continue;
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
  let out = '';
  let cursor = 0;
  const urlToken = /url\s*\(\s*/iy;
  while (cursor < source.length) {
    const ch = source[cursor] ?? '';
    if (ch === '/' && source[cursor + 1] === '*') {
      const end = source.indexOf('*/', cursor + 2);
      const until = end < 0 ? source.length : end + 2;
      out += source.slice(cursor, until);
      cursor = until;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let end = cursor + 1;
      while (end < source.length) {
        if (source[end] === '\\') { end += 2; continue; }
        if (source[end] === ch) { end += 1; break; }
        end += 1;
      }
      out += source.slice(cursor, end);
      cursor = end;
      continue;
    }
    
    let prefix: string | undefined;
    if ((ch === 'u' || ch === 'U') &&
        (cursor === 0 || !/[\w-]/u.test(source[cursor - 1] ?? ''))) {
      urlToken.lastIndex = cursor;
      prefix = urlToken.exec(source)?.[0];
    }
    if (!prefix) { out += ch; cursor += 1; continue; }
    const contentStart = cursor + prefix.length;
    const quote = source[contentStart] === '"' || source[contentStart] === "'"
      ? source[contentStart] : '';
    const valueStart = contentStart + (quote ? 1 : 0);
    let valueEnd = valueStart;
    while (valueEnd < source.length) {
      const current = source[valueEnd] ?? '';
      if (current === '\\') { valueEnd += 2; continue; }
      if (quote ? current === quote : current === ')') break;
      valueEnd += 1;
    }
    const suffix = quote ? /^\s*\)/u.exec(source.slice(valueEnd + 1))?.[0] : '';
    const finish = quote ? valueEnd + 1 + (suffix?.length ?? 0) : valueEnd + 1;
    if (valueEnd >= source.length || (quote && suffix === undefined)) {
      out += ch;
      cursor += 1;
      continue;
    }
    const raw = source.slice(valueStart, valueEnd);
    const decoded = decodeCssEscapes(raw.trim());
    const next = replaceLocalReference(decoded, path, oldPath, newPath);
    if (next === decoded) {
      out += source.slice(cursor, finish);
    } else {
      out += prefix + quote + next + quote + (quote ? suffix : ')');
    }
    cursor = finish;
  }
  return out;
}
