import type { LoadedEpub } from '../model/epubTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import type { Issue } from '../model/issueTypes';
import { HTML_MEDIA_TYPES } from '../utils/constants';
import { createIssue } from '../utils/issueFactory';
import { parseXml } from '../utils/xmlUtils';
import { coverSvgAccessibleLabel } from '../repair/coverSvgAccessibility';

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

    // Relações ARIA quebradas podem deixar descrições invisíveis ao leitor
    // de tela. Detectar sem reescrever IDs ou conteúdo editorial.
    const missingDescriptions = elements.flatMap((element) => {
      const ids = element.getAttribute('aria-describedby')?.trim().split(/\s+/u) ?? [];
      return ids.filter((id) => id && !existingIds.has(id));
    });
    if (missingDescriptions.length > 0) {
      issues.push(createIssue({
        code: 'CONTENT_ARIA_DESCRIBED_BY_MISSING',
        severity: 'warning',
        title: 'Descrição acessível aponta para identificador inexistente',
        detail: 'aria-describedby referencia ' + missingDescriptions.length +
          ' identificador(es) ausente(s). Revise a relação sem editar o texto automaticamente.',
        file: item.resolvedPath,
        context: [...new Set(missingDescriptions)].join(', '),
        repairable: false,
      }));
    }

    // Quando dois elementos partilham o mesmo ID referenciado por ARIA,
    // leitores de tela podem escolher destinos distintos.
    const idCount = new Map<string, number>();
    for (const element of elements) {
      const id = element.getAttribute('id');
      if (id) idCount.set(id, (idCount.get(id) ?? 0) + 1);
    }
    const duplicateTargets = new Set<string>();
    for (const element of elements) {
      for (const attribute of ['aria-labelledby', 'aria-describedby']) {
        for (const id of (element.getAttribute(attribute) ?? '').trim().split(/\s+/u)) {
          if (id && (idCount.get(id) ?? 0) > 1) duplicateTargets.add(id);
        }
      }
    }
    if (duplicateTargets.size > 0) {
      issues.push(createIssue({
        code: 'CONTENT_ARIA_REFERENCE_AMBIGUOUS',
        severity: 'warning',
        title: 'Referência ARIA ambígua por IDs duplicados',
        detail: 'Há múltiplos destinos para o mesmo identificador ARIA. ' +
          'Revise IDs e referências sem aplicar renomeação automática.',
        file: item.resolvedPath,
        context: [...duplicateTargets].join(', '),
        repairable: false,
      }));
    }

    const root = document.documentElement;
    const lang = root.getAttribute('lang')?.trim() ?? '';
    const xmlLang = (root.getAttributeNS(
      'http://www.w3.org/XML/1998/namespace', 'lang',
    ) ?? root.getAttribute('xml:lang') ?? '').trim();
    if (lang && xmlLang && lang.toLowerCase() !== xmlLang.toLowerCase()) {
      issues.push(createIssue({
        code: 'CONTENT_LANGUAGE_CONFLICT',
        severity: 'warning',
        title: 'Idioma da página diverge entre lang e xml:lang',
        detail: 'Os atributos lang e xml:lang da raiz não concordam. ' +
          'Confirme o idioma editorial antes de alterar metadados.',
        file: item.resolvedPath,
        repairable: false,
      }));
    }

    const unnamedLinks = elements.filter((element) => {
      if (element.localName.toLowerCase() !== 'a' || !element.hasAttribute('href')) return false;
      if (element.textContent?.trim() || element.getAttribute('aria-label')?.trim() ||
          element.getAttribute('title')?.trim() ||
          element.getAttribute('aria-labelledby')?.trim()) return false;
      const image = Array.from(element.getElementsByTagName('*')).find((child) =>
        child.localName.toLowerCase() === 'img' && child.getAttribute('alt')?.trim());
      return !image;
    });
    if (unnamedLinks.length > 0) {
      issues.push(createIssue({
        code: 'CONTENT_LINK_NAME_MISSING',
        severity: 'info',
        title: 'Link sem nome acessível',
        detail: unnamedLinks.length + ' link(s) não possui(em) texto, título, ' +
          'rótulo ARIA ou imagem descritiva. Verifique navegação assistiva.',
        file: item.resolvedPath,
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
      // O SVG que exibe somente a capa oficial pode aproveitar o título
      // editorial da página; diagramas genéricos não recebem rótulo inventado.
      const canLabelCover = inlineSvg.length === 1 && Boolean(
        coverSvgAccessibleLabel(inlineSvg[0]!, document, item.resolvedPath, pkg));
      issues.push(createIssue({
        code: 'CONTENT_INLINE_SVG_LABEL_MISSING',
        severity: 'info',
        title: 'SVG inline possivelmente sem descrição acessível',
        detail: canLabelCover
          ? 'SVG de capa sem nome acessível. Uma otimização opcional pode ' +
            'reutilizar o título da página como rótulo, sem alterar a imagem.'
          : inlineSvg.length + ' SVG(s) não possui(em) título ou rótulo explícito. ' +
            'Se forem decorativos, informe aria-hidden="true"; caso contrário, descreva-os.',
        file: item.resolvedPath,
        repairable: canLabelCover,
      }));
    }
  }
  return issues;
}
