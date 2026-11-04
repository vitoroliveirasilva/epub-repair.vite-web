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

  let output = text.replace(
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
