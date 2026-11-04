import type { RepairAction } from '../model/repairTypes';
import { isRemoteUrl, resolveReference } from '../utils/pathUtils';

export interface SanitizeCssResult {
  text: string;
  changed: boolean;
  actions: RepairAction[];
}

export function sanitizeCssDocument(
  filePath: string,
  text: string,
  existingFiles: Set<string>,
): SanitizeCssResult {
  const actions: RepairAction[] = [];
  let changed = false;

  let output = text.replace(
    /@import\s+(?:url\(\s*)?(?:(["'])(.*?)\1|([^"'\s);]+))\s*\)?[^;]*;/giu,
    (full, _quote: string, quotedValue: string, unquotedValue: string) => {
      const rawValue = quotedValue || unquotedValue || '';
      if (isUnsafeCssReference(filePath, rawValue.trim(), existingFiles)) {
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
      if (isUnsafeCssReference(filePath, value, existingFiles)) {
        changed = true;
        return 'none';
      }
      return full;
    },
  );

  if (changed) {
    actions.push({
      type: 'updated',
      title: 'Referências CSS inseguras neutralizadas',
      detail: 'URLs remotas ou quebradas em CSS foram substituídas por none.',
      file: filePath,
    });
  }

  return { text: output, changed, actions };
}

function isUnsafeCssReference(
  filePath: string,
  value: string,
  existingFiles: Set<string>,
): boolean {
  if (!value || value.startsWith('#')) return false;
  if (isRemoteUrl(decodeCssEscapes(value))) return true;
  const resolved = resolveReference(filePath, value);
  return !resolved.safe || !existingFiles.has(resolved.path);
}

function decodeCssEscapes(value: string): string {
  return value.replace(/\\([0-9a-f]{1,6})\s?|\\([^0-9a-f])/giu, (_full, hex: string | undefined, escaped: string | undefined) => {
    if (hex) {
      const point = Number.parseInt(hex, 16);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    }
    return escaped ?? '';
  });
}
