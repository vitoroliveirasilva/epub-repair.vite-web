import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { CSS_MEDIA_TYPES } from '../utils/constants';
import { createIssue } from '../utils/issueFactory';
import { isRemoteUrl, resolveReference } from '../utils/pathUtils';
import { extractCssResourceReferences } from './referenceExtractor';

export function validateCssReferences(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  const issues: Issue[] = [];
  const candidates = pkg.manifest.filter(
    (item) => item.exists && CSS_MEDIA_TYPES.has(item.mediaType),
  );

  for (const item of candidates) {
    const file = loaded.files.get(item.resolvedPath);
    if (!file) continue;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(file.bytes);

    for (const ref of extractCssResourceReferences(text)) {
      if (!ref.value || ref.value.startsWith('#')) continue;
      if (isRemoteUrl(ref.value)) {
        issues.push(
          createIssue({
            code: 'CSS_REMOTE_RESOURCE',
            severity: 'info',
            title: 'CSS referencia recurso externo',
            detail: `O CSS referencia "${ref.raw}". Recursos externos podem falhar offline no Kindle.`,
            file: item.resolvedPath,
            context: ref.attr,
            repairable: true,
          }),
        );
        continue;
      }

      const resolved = resolveReference(item.resolvedPath, ref.value);
      if (!resolved.safe || !loaded.files.has(resolved.path)) {
        issues.push(
          createIssue({
            code: 'CSS_MISSING_RESOURCE',
            severity: 'warning',
            title: 'CSS referencia arquivo ausente',
            detail: `A referência "${ref.raw}" aponta para "${resolved.path}", mas o arquivo não existe no EPUB.`,
            file: item.resolvedPath,
            context: ref.attr,
            repairable: true,
          }),
        );
      }
    }
  }

  return issues;
}
