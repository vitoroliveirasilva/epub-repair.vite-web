import type { LoadedEpub } from '../model/epubTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import type { Issue } from '../model/issueTypes';
import { createIssue } from '../utils/issueFactory';

const SCRIPT_MIME = /^(?:text|application)\/(?:javascript|ecmascript)$/iu;
const SCRIPT_EXTENSION = /\.(?:js|mjs|cjs)$/iu;

/**
 * Inventário dos scripts declarados. EPUB 3 permite scripting;
 * esta informação NÃO equivale a malware nem remove conteúdo automaticamente.
 * Scripts órfãos são catalogados separadamente pelo detector de órfãos.
 */
export function validateDeclaredScripts(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  const issues: Issue[] = [];
  for (const item of pkg.manifest) {
    if (!item.exists) continue;
    if (!SCRIPT_MIME.test(item.mediaType) && !SCRIPT_EXTENSION.test(item.resolvedPath)) continue;
    if (!loaded.files.has(item.resolvedPath)) continue;
    issues.push(createIssue({
      code: 'PACKAGE_DECLARED_SCRIPT',
      severity: 'info',
      title: 'JavaScript declarado no EPUB',
      detail: 'O recurso pode ser legítimo no EPUB 3. Não é prova de ameaça e não ' +
        'foi executado, adicionado a outros documentos ou removido automaticamente.',
      file: item.resolvedPath,
      repairable: false,
    }));
  }
  return issues;
}
