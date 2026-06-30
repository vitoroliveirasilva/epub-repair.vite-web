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
    /@import\s+(?:url\(\s*)?(?:["'])([^"']+)(?:["'])\s*\)?[^;]*;/giu,
    (full, rawValue: string) => {
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
  if (isRemoteUrl(value)) return true;
  const resolved = resolveReference(filePath, value);
  return !resolved.safe || !existingFiles.has(resolved.path);
}
