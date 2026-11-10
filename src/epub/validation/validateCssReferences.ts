import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { CSS_MEDIA_TYPES } from '../utils/constants';
import { createIssue } from '../utils/issueFactory';
import {
  decodeCssEscapes,
  isInlineFontDataUrl,
  isSafeInlineImageDataUrl,
  isRemoteUrl,
  isSafeRemoteResourceUrl,
  resolveReference,
} from '../utils/pathUtils';
import { extractCssResourceReferences } from './referenceExtractor';
import { containsDangerousCss } from '../sanitize/sanitizeActiveContent';

export function validateCssReferences(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  const issues: Issue[] = [];
  const candidates = pkg.manifest.filter(
    (item) => item.exists && CSS_MEDIA_TYPES.has(item.mediaType),
  );

  for (const item of candidates) {
    const file = loaded.files.get(item.resolvedPath);
    if (!file) continue;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(file.bytes);
    if (containsDangerousCss(text.replace(/\/\*[\s\S]*?\*\//gu, ''))) {
      issues.push(createIssue({
        code: 'CSS_UNSAFE_RESOURCE',
        severity: 'warning',
        title: 'Declaração ativa detectada no CSS',
        detail: 'O CSS contém expressão, behavior, binding ou URL de esquema executável. ' +
          'Confira se a limpeza automática conseguiu neutralizar o conteúdo.',
        file: item.resolvedPath,
        repairable: true,
      }));
    }

    for (const ref of extractCssResourceReferences(text)) {
      if (!ref.value || ref.value.startsWith('#')) continue;
      const decodedUrl = decodeCssEscapes(ref.value);
      if (decodedUrl.startsWith('#')) continue;
      if (isRemoteUrl(decodedUrl)) {
        
        if (isSafeRemoteResourceUrl(decodedUrl) || isInlineFontDataUrl(decodedUrl) ||
          isSafeInlineImageDataUrl(decodedUrl)) continue;
        issues.push(
          createIssue({
            code: 'CSS_UNSAFE_RESOURCE',
            severity: 'warning',
            title: 'CSS contém referência potencialmente perigosa',
            detail: `A referência "${ref.raw}" usa um esquema não permitido para recursos CSS.`,
            file: item.resolvedPath,
            context: ref.attr,
            repairable: true,
          }),
        );
        continue;
      }

      
      
      const resolved = resolveReference(item.resolvedPath, decodedUrl);
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
