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

  const output = text.replace(
    /url\(\s*(["']?)(.*?)\1\s*\)/giu,
    (full, _quote: string, rawValue: string) => {
      const value = rawValue.trim();
      if (!value || value.startsWith('#')) return full;
      if (isRemoteUrl(value)) {
        changed = true;
        return 'none';
      }
      const resolved = resolveReference(filePath, value);
      if (!resolved.safe || !existingFiles.has(resolved.path)) {
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
