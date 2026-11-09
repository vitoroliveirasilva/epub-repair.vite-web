import type { RepairAction } from '../model/repairTypes';
import { containsDangerousCss } from './sanitizeActiveContent';
import { cssCodePosition } from '../utils/cssContexts';
import {
  decodeCssEscapes,
  isInlineFontDataUrl,
  isSafeInlineImageDataUrl,
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

  // Comentários CSS são conteúdo inerte: não reescrever URLs que aparecem
  // em comentários do livro. O parser considera aspas e escapes.
  const fontCommented = cssCodePosition(text);
  let output = text.replace(/@font-face\s*\{[^{}]*\}/giu, (block, offset: number) => {
    if (!fontCommented(offset)) return block;
    const sanitized = sanitizeFontFaceBlock(block, filePath, existingFiles, removeRemoteResourceLinks);
    if (sanitized !== block) changed = true;
    return sanitized;
  });

  const importCommented = cssCodePosition(output);
  output = output.replace(
    /@import\s+(?:url\(\s*)?(?:(["'])(.*?)\1|([^"'\s);]+))\s*\)?[^;]*;/giu,
    (full, _quote: string, quotedValue: string, unquotedValue: string, offset: number) => {
      if (!importCommented(offset)) return full;
      const rawValue = quotedValue || unquotedValue || '';
      if (isUnsafeCssReference(filePath, rawValue.trim(), existingFiles, removeRemoteResourceLinks)) {
        changed = true;
        return '';
      }
      return full;
    },
  );

  const urlCommented = cssCodePosition(output);
  output = output.replace(
    /url\(\s*(["']?)(.*?)\1\s*\)/giu,
    (full, _quote: string, rawValue: string, offset: number) => {
      if (!urlCommented(offset)) return full;
      const value = rawValue.trim();
      if (!value || value.startsWith('#')) return full;
      if (isUnsafeCssReference(filePath, value, existingFiles, removeRemoteResourceLinks)) {
        changed = true;
        return 'none';
      }
      return full;
    },
  );

  // CSS ofuscado que escapou dos padrões de substituição não pode ser
  // exportado como se tivesse sido saneado. Falhar sem modificar o arquivo.
  if (containsDangerousCss(output)) {
    throw new Error('CSS com escape, comentário ou declaração ativa não ' +
      'neutralizável automaticamente em ' + filePath + '. Revisão manual necessária.');
  }

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
  if (isInlineFontDataUrl(decoded) || isSafeInlineImageDataUrl(decoded)) return false;
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
  let hasValidSource = false;

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
    // Várias declarações src são válidas no CSS: uma origem insegura não
    // pode eliminar outro src local/HTTPS legítimo no mesmo @font-face.
    if (safeAlternatives.some((alternative) => alternative.trim().length > 0)) {
      hasValidSource = true;
    }
    if (safeAlternatives.length === alternatives.length) return declaration;
    changed = true;
    if (!safeAlternatives.length) return '';
    return `${declaration.slice(0, separator + 1)}${safeAlternatives.join(',')}`;
  });

  if (!changed) return block;
  // Um @font-face sem qualquer fonte utilizável não pode ser preservado como regra válida.
  if (!hasValidSource) return '';
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

