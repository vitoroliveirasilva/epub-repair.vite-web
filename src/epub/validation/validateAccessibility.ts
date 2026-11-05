import type { LoadedEpub } from '../model/epubTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import type { Issue } from '../model/issueTypes';
import { HTML_MEDIA_TYPES } from '../utils/constants';
import { createIssue } from '../utils/issueFactory';
import { parseXml } from '../utils/xmlUtils';

/** Diagnóstico apenas: alt="" é válido para imagem decorativa. */
export function validateAccessibility(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  const issues: Issue[] = [];
  for (const item of pkg.manifest) {
    if (!item.exists || !HTML_MEDIA_TYPES.has(item.mediaType)) continue;
    const bytes = loaded.files.get(item.resolvedPath)?.bytes;
    if (!bytes) continue;
    const markup = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    let document: Document;
    try {
      document = item.mediaType === 'text/html'
        ? new DOMParser().parseFromString(markup, 'text/html')
        : parseXml(markup.replace(/&nbsp;/giu, '&#160;'), 'application/xhtml+xml');
    } catch {
      continue; // Conteúdo malformado já possui diagnóstico próprio.
    }
    const missingAlt = Array.from(document.getElementsByTagName('*'))
      .filter((element) => element.localName.toLowerCase() === 'img' &&
        !element.hasAttribute('alt'));
    if (missingAlt.length === 0) continue;

    issues.push(createIssue({
      code: 'CONTENT_IMAGE_ALT_MISSING',
      severity: 'warning',
      title: 'Imagem sem atributo alt',
      detail: `${missingAlt.length} imagem(ns) não possui(em) alt. Descreva o conteúdo ou use alt="" se for decorativa.`,
      file: item.resolvedPath,
      repairable: false,
    }));
  }
  return issues;
}
