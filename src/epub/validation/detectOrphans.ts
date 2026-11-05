import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { RELEVANT_MEDIA_TYPES, SYSTEM_FILE_PATTERNS } from '../utils/constants';
import { createIssue } from '../utils/issueFactory';
import { guessMediaType } from '../utils/mediaTypes';

export function detectOrphanResources(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  const issues: Issue[] = [];
  const declared = new Set(pkg.manifest.map((item) => item.resolvedPath));
  const reserved = new Set(['mimetype', 'META-INF/container.xml', pkg.opfPath]);

  for (const fileName of loaded.files.keys()) {
    if (reserved.has(fileName) || declared.has(fileName)) continue;
    if (SYSTEM_FILE_PATTERNS.some((pattern) => pattern.test(fileName))) continue;
    const mediaType = guessMediaType(fileName);
    if (!mediaType || !RELEVANT_MEDIA_TYPES.has(mediaType)) continue;

    if (mediaType === 'text/javascript') {
      issues.push(createIssue({
        code: 'PACKAGE_UNDECLARED_SCRIPT',
        severity: 'warning',
        title: 'JavaScript fora do manifest precisa de revisão',
        detail: 'O script pode ser legítimo em EPUB 3. Não foi classificado como malware, ' +
          'mas também não deve ser declarado automaticamente sem confirmar seu uso.',
        file: fileName,
        repairable: false,
      }));
      continue;
    }

    issues.push(
      createIssue({
        code: 'ORPHAN_RESOURCE',
        severity: 'info',
        title: 'Recurso relevante fora do manifest',
        detail:
          'O arquivo existe no EPUB, mas não está declarado no manifest. Pode ser sobra ou referência esquecida.',
        file: fileName,
        repairable: true,
      }),
    );
  }

  return issues;
}
