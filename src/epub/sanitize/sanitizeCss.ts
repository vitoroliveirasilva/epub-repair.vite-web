import type { RepairAction } from '../model/repairTypes';
import {
  decodeCssEscapes,
  isInlineFontDataUrl,
  isRemoteUrl,
  isSafeRemoteResourceUrl,
  resolveReference,
} from '../utils/pathUtils';

export interface SanitizeCssResult {
  text: string;
  changed: boolean;
  actions: RepairAction[];
}

export function sanitizeCssDocument(
  filePath: string,
  text: string,
  existingFiles: Set<string>,
  removeRemoteResourceLinks = false,
): SanitizeCssResult {
  const actions: RepairAction[] = [];
  let changed = false;

  let output = text.replace(/@font-face\s*\{[^{}]*\}/giu, (block) => {
    const sanitized = sanitizeFontFaceBlock(block, filePath, existingFiles, removeRemoteResourceLinks);
    if (sanitized !== block) changed = true;
    return sanitized;
  });

  output = output.replace(
    /@import\s+(?:url\(\s*)?(?:(["'])(.*?)\1|([^"'\s);]+))\s*\)?[^;]*;/giu,
    (full, _quote: string, quotedValue: string, unquotedValue: string) => {
      const rawValue = quotedValue || unquotedValue || '';
      if (isUnsafeCssReference(filePath, rawValue.trim(), existingFiles, removeRemoteResourceLinks)) {
        changed = true;
        return '';
      }
      return full;
    },
  );

  output = output.replace(
    /url\(\s*(["']?)(.*?)\1\s*\)/giu,
    (full, _quote: string, rawValue: string) => {
      const value = rawValue.trim();
      if (!value || value.startsWith('#')) return full;
      if (isUnsafeCssReference(filePath, value, existingFiles, removeRemoteResourceLinks)) {
        changed = true;
        return 'none';
      }
      return full;
    },
  );

  if (changed) {
    actions.push({
      type: 'updated',
      title: 'Referências CSS inválidas neutralizadas',
      detail: 'Ajustou URLs inseguras ou arquivos ausentes, preservando fontes e estilos externos legítimos quando permitido.',
      file: filePath,
    });
  }

  return { text: output, changed, actions };
}

function isUnsafeCssReference(
  filePath: string,
  value: string,
  existingFiles: Set<string>,
  removeRemoteResourceLinks: boolean,
): boolean {
  if (!value || value.startsWith('#')) return false;
  const decoded = decodeCssEscapes(value);
  if (isInlineFontDataUrl(decoded)) return false;
  if (isRemoteUrl(decoded)) {
    if (isSafeRemoteResourceUrl(decoded)) return removeRemoteResourceLinks;
    return true;
  }
  const resolved = resolveReference(filePath, decoded);
  return !resolved.safe || !existingFiles.has(resolved.path);
}

/**
 * Sanitiza somente fontes inseguras do src, sem produzir "src:none format(...)"
 * e sem destruir alternativas válidas, incluindo data:font/woff2;base64.
 */
function sanitizeFontFaceBlock(
  block: string,
  filePath: string,
  files: Set<string>,
  removeRemote: boolean,
): string {
  const open = block.indexOf('{');
  const content = block.slice(open + 1, -1);
  const declarations = splitTopLevelCss(content, ';');
  let changed = false;
  let noValidSource = false;

  const cleaned = declarations.map((declaration) => {
    const separator = declaration.indexOf(':');
    if (separator < 0 || declaration.slice(0, separator).trim().toLowerCase() !== 'src') {
      return declaration;
    }
    const alternatives = splitTopLevelCss(declaration.slice(separator + 1), ',');
    const safeAlternatives = alternatives.filter((alternative) => {
      const references = Array.from(alternative.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/giu));
      return !references.some((match) =>
        isUnsafeCssReference(filePath, (match[2] ?? '').trim(), files, removeRemote),
      );
    });
    if (safeAlternatives.length === alternatives.length) return declaration;
    changed = true;
    if (!safeAlternatives.length) {
      noValidSource = true;
      return '';
    }
    return `${declaration.slice(0, separator + 1)}${safeAlternatives.join(',')}`;
  });

  if (!changed) return block;
  // Um @font-face sem qualquer fonte utilizável não pode ser preservado como regra válida.
  if (noValidSource) return '';
  return `${block.slice(0, open + 1)}${cleaned.join(';')}}`;
}

/** Divide listas CSS sem cortar data URIs ou vírgulas dentro de parênteses/strings. */
function splitTopLevelCss(input: string, separator: ',' | ';'): string[] {
  const parts: string[] = [];
  let start = 0;
  let quote = '';
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index] ?? '';
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (char === separator && depth === 0) {
      parts.push(input.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(input.slice(start));
  return parts;
}
