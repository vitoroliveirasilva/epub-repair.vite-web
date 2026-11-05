import type { LoadedEpub } from '../model/epubTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import type { Issue } from '../model/issueTypes';
import { HTML_MEDIA_TYPES } from '../utils/constants';
import { createIssue } from '../utils/issueFactory';
import { isRemoteUrl, resolveReference } from '../utils/pathUtils';
import { parseXml } from '../utils/xmlUtils';

/** Verifica fragmentos locais sem exigir que todo capítulo esteja no índice. */
export function validateInternalAnchors(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  const issues: Issue[] = [];
  const parsed = new Map<string, Document | null>();

  const readDocument = (path: string): Document | null => {
    if (parsed.has(path)) return parsed.get(path) ?? null;
    const bytes = loaded.files.get(path)?.bytes;
    if (!bytes || !/\.(?:xhtml?|svg)$/iu.test(path)) {
      parsed.set(path, null);
      return null;
    }
    try {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const document = parseXml(text.replace(/&nbsp;/giu, '&#160;'), 'application/xhtml+xml');
      parsed.set(path, document);
      return document;
    } catch {
      parsed.set(path, null);
      return null;
    }
  };

  for (const item of pkg.manifest) {
    if (!item.exists || !(HTML_MEDIA_TYPES.has(item.mediaType) || item.mediaType === 'image/svg+xml')) continue;
    const source = readDocument(item.resolvedPath);
    if (!source) continue;

    for (const node of Array.from(source.getElementsByTagName('*'))) {
      const href = node.getAttribute('href') ?? node.getAttribute('xlink:href');
      if (!href || isRemoteUrl(href)) continue;
      const hash = href.indexOf('#');
      if (hash === -1 || hash === href.length - 1) continue;

      const rawFragment = href.slice(hash + 1);
      if (/^(?:epubcfi\(|svgView\(|xywh=|t=)/iu.test(rawFragment)) continue;
      let fragment: string;
      try {
        fragment = decodeURIComponent(rawFragment);
      } catch {
        continue; // URI malformada é diagnosticada por validação de referências.
      }
      const ref = href.slice(0, hash);
      const target = ref ? resolveReference(item.resolvedPath, ref) : {
        path: item.resolvedPath, safe: true,
      };
      if (!target.safe || !loaded.files.has(target.path)) continue;
      const targetDoc = readDocument(target.path);
      if (!targetDoc) continue;

      const found = Array.from(targetDoc.getElementsByTagName('*')).some((element) =>
        element.getAttribute('id') === fragment ||
        (element.localName === 'a' && element.getAttribute('name') === fragment),
      );
      if (found) continue;

      issues.push(createIssue({
        code: 'CONTENT_MISSING_FRAGMENT',
        severity: 'warning',
        title: 'Link interno aponta para âncora inexistente',
        detail: `A referência "${href}" aponta para um identificador ausente no documento de destino.`,
        file: item.resolvedPath,
        context: href,
        repairable: false,
      }));
    }
  }
  return issues;
}
