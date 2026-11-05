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
    const elements = Array.from(document.getElementsByTagName('*'));
    const missingAlt = elements.filter((element) =>
      element.localName.toLowerCase() === 'img' && !element.hasAttribute('alt'));
    if (missingAlt.length > 0) {
      issues.push(createIssue({
        code: 'CONTENT_IMAGE_ALT_MISSING',
        severity: 'warning',
        title: 'Imagem sem atributo alt',
        detail: `${missingAlt.length} imagem(ns) não possui(em) alt. Descreva o conteúdo ou use alt="" se for decorativa.`,
        file: item.resolvedPath,
        repairable: false,
      }));
    }

    const existingIds = new Set(elements.map((element) => element.getAttribute('id'))
      .filter((value): value is string => Boolean(value)));
    const missingLabels = elements.flatMap((element) => {
      const ids = element.getAttribute('aria-labelledby')?.trim().split(/\s+/u) ?? [];
      return ids.filter((id) => id && !existingIds.has(id));
    });
    if (missingLabels.length > 0) {
      issues.push(createIssue({
        code: 'CONTENT_ARIA_LABELLED_BY_MISSING',
        severity: 'warning',
        title: 'Rótulo acessível aponta para identificador inexistente',
        detail: 'aria-labelledby referencia ' + missingLabels.length +
          ' identificador(es) ausente(s). Corrija a relação manualmente.',
        file: item.resolvedPath,
        context: [...new Set(missingLabels)].join(', '),
        repairable: false,
      }));
    }

    const inlineSvg = elements.filter((element) =>
      element.localName === 'svg' &&
      element.namespaceURI === 'http://www.w3.org/2000/svg' &&
      element.getAttribute('aria-hidden') !== 'true' &&
      element.getAttribute('role') !== 'presentation' &&
      element.getAttribute('role') !== 'none' &&
      !element.getAttribute('aria-label')?.trim() &&
      !element.getAttribute('aria-labelledby')?.trim() &&
      !Array.from(element.children).some((child) =>
        (child.localName === 'title' || child.localName === 'desc') &&
        Boolean(child.textContent?.trim())));
    if (inlineSvg.length > 0) {
      issues.push(createIssue({
        code: 'CONTENT_INLINE_SVG_LABEL_MISSING',
        severity: 'info',
        title: 'SVG inline possivelmente sem descrição acessível',
        detail: inlineSvg.length + ' SVG(s) não possui(em) título ou rótulo explícito. ' +
          'Se forem decorativos, informe aria-hidden="true"; caso contrário, descreva-os.',
        file: item.resolvedPath,
        repairable: false,
      }));
    }
  }
  return issues;
}
