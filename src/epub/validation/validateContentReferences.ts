import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { HTML_MEDIA_TYPES } from '../utils/constants';
import { createIssue } from '../utils/issueFactory';
import { isInternalAnchor, isRemoteUrl, resolveReference } from '../utils/pathUtils';
import { parseXml } from '../utils/xmlUtils';
import { extractHtmlResourceReferences } from './referenceExtractor';

export function validateContentReferences(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  const issues: Issue[] = [];
  const candidates = pkg.manifest.filter(
    (item) => item.exists && HTML_MEDIA_TYPES.has(item.mediaType),
  );

  for (const item of candidates) {
    const file = loaded.files.get(item.resolvedPath);
    if (!file) continue;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(file.bytes);

    if (/<script\b|\son[a-z]+\s*=|<(?:iframe|embed|object)\b/iu.test(text)) {
      issues.push(
        createIssue({
          code: /<(?:iframe|embed|object)\b/iu.test(text)
            ? 'CONTENT_UNSAFE_EMBED'
            : 'CONTENT_SCRIPTED',
          severity: 'warning',
          title: /<(?:iframe|embed|object)\b/iu.test(text)
            ? 'Conteúdo com iframe/embed/object'
            : 'Conteúdo com script ou handler inline',
          detail:
            'Recursos interativos ou scripts podem gerar rejeição, falhas ou comportamento estranho no Kindle.',
          file: item.resolvedPath,
          repairable: true,
        }),
      );
    }

    if (item.mediaType === 'application/xhtml+xml') {
      try {
        parseXml(text, 'application/xhtml+xml');
      } catch (error) {
        issues.push(
          createIssue({
            code: 'CONTENT_INVALID_XML',
            severity: 'warning',
            title: 'XHTML com XML inválido',
            detail:
              error instanceof Error
                ? error.message
                : 'O conteúdo não pôde ser lido como XHTML válido.',
            file: item.resolvedPath,
            repairable: false,
          }),
        );
      }
    }

    for (const ref of extractHtmlResourceReferences(text)) {
      if (!ref.value || isInternalAnchor(ref.raw)) continue;

      if (ref.value.startsWith('kindle:embed:')) {
        issues.push(
          createIssue({
            code: 'CONTENT_KINDLE_EMBED_BROKEN',
            severity: 'warning',
            title: 'Referência kindle:embed encontrada',
            detail:
              'Referências proprietárias kindle:embed podem quebrar fora do ambiente original e serão neutralizadas no reparo seguro.',
            file: item.resolvedPath,
            context: ref.raw,
            repairable: true,
          }),
        );
        continue;
      }

      if (isRemoteUrl(ref.value)) {
        issues.push(
          createIssue({
            code: 'CONTENT_REMOTE_RESOURCE',
            severity: 'info',
            title: 'Referência externa encontrada',
            detail: `O conteúdo referencia "${ref.raw}". Recursos remotos podem não funcionar offline no Kindle.`,
            file: item.resolvedPath,
            context: ref.attr,
            repairable: ref.attr === 'href',
          }),
        );
        continue;
      }

      const resolved = resolveReference(item.resolvedPath, ref.value);
      if (!resolved.path) continue;
      if (!resolved.safe || !loaded.files.has(resolved.path)) {
        issues.push(
          createIssue({
            code: 'CONTENT_MISSING_RESOURCE',
            severity: 'warning',
            title: 'Recurso referenciado no conteúdo não existe',
            detail: `A referência "${ref.raw}" aponta para "${resolved.path}", mas esse arquivo não foi encontrado no EPUB.`,
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
