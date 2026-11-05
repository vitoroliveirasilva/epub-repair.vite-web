import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import { createIssue } from '../utils/issueFactory';

const SUSPICIOUS_EXTENSION = /\.(?:exe|dll|com|bat|cmd|ps1|scr|msi|apk|jar|vbs|wasm)$/iu;

/**
 * Sinais de arquivos executáveis não são prova de malware.
 * Não remove scripts EPUB3 legítimos (.js) e não impede referências HTTPS.
 */
export function validateSuspiciousResources(loaded: LoadedEpub): Issue[] {
  const issues: Issue[] = [];
  for (const [path, entry] of loaded.files) {
    const bytes = entry.bytes;
    const isMz = bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a;
    const isElf = bytes.length >= 4 &&
      bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46;
    if (!SUSPICIOUS_EXTENSION.test(path) && !isMz && !isElf) continue;

    issues.push(createIssue({
      code: 'PACKAGE_SUSPICIOUS_EXECUTABLE',
      severity: 'warning',
      title: 'Arquivo potencialmente executável no EPUB',
      detail: 'O pacote contém um arquivo executável ou assinatura binária inesperada. ' +
        'Isso não comprova malware, mas exige revisão manual antes de distribuir o EPUB.',
      file: path,
      repairable: false,
    }));
  }
  return issues;
}
