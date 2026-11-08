import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { createIssue } from '../utils/issueFactory';
import { isRemoteUrl, resolveReference } from '../utils/pathUtils';
import { parseXml } from '../utils/xmlUtils';

const EPUB_NS = 'http://www.idpf.org/2007/ops';
const NOTES = new Set(['footnote', 'endnote', 'footnotes', 'endnotes', 'rearnote', 'rearnotes']);

function semanticTokens(element: Element): Set<string> {
  const epub = element.getAttributeNS(EPUB_NS, 'type') ??
    element.getAttribute('epub:type') ?? '';
  const role = element.getAttribute('role') ?? '';
  return new Set([...epub.split(/\s+/u), ...role.split(/\s+/u)
    .map((token) => token.startsWith('doc-') ? token.slice(4) : token)]
    .filter(Boolean));
}

function hasSemanticRole(element: Element, roles: ReadonlySet<string>): boolean {
  return [...semanticTokens(element)].some((token) => roles.has(token));
}

function resolveInternalTarget(
  loaded: LoadedEpub,
  read: (path: string) => Document | undefined,
  sourcePath: string,
  href: string,
): Element | undefined {
  if (!href || isRemoteUrl(href)) return undefined;
  const hash = href.indexOf('#');
  if (hash < 0 || hash === href.length - 1) return undefined;
  let anchor: string;
  try {
    anchor = decodeURIComponent(href.slice(hash + 1));
  } catch {
    return undefined;
  }
  const pathRef = href.slice(0, hash);
  const targetPath = pathRef ? resolveReference(sourcePath, pathRef) :
    { path: sourcePath, safe: true };
  if (!targetPath.safe || !loaded.files.has(targetPath.path)) return undefined;
  const document = read(targetPath.path);
  return document && Array.from(document.getElementsByTagName('*')).find((element) =>
    element.getAttribute('id') === anchor ||
    (element.localName === 'a' && element.getAttribute('name') === anchor));
}

/**
 * Notas e backlinks EPUB: verificar somente links com semântica explícita.
 * A ausência de backlink não é erro: existem notas legítimas sem um.
 * Nunca fabricar remissões nem renomear IDs editoriais.
 */
export function validateFootnotes(
  loaded: LoadedEpub,
  pkg: PackageDocumentInfo,
): Issue[] {
  const issues: Issue[] = [];
  const cache = new Map<string, Document | undefined>();
  const read = (path: string): Document | undefined => {
    if (cache.has(path)) return cache.get(path);
    const bytes = loaded.files.get(path)?.bytes;
    const item = pkg.manifest.find((entry) => entry.resolvedPath === path);
    if (!bytes || !item ||
        !['application/xhtml+xml', 'text/html'].includes(item.mediaType)) {
      cache.set(path, undefined);
      return undefined;
    }
    try {
      const markup = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const doc = item.mediaType === 'text/html'
        ? new DOMParser().parseFromString(markup, 'text/html')
        : parseXml(markup.replace(/&nbsp;/giu, '&#160;'));
      cache.set(path, doc);
      return doc;
    } catch {
      cache.set(path, undefined);
      return undefined;
    }
  };
  for (const item of pkg.manifest) {
    if (!item.exists || !['application/xhtml+xml', 'text/html'].includes(item.mediaType)) continue;
    const doc = read(item.resolvedPath);
    if (!doc) continue;
    for (const anchor of Array.from(doc.getElementsByTagName('*')).filter((node) =>
      node.localName === 'a')) {
      const types = semanticTokens(anchor);
      if (!types.has('noteref') && !types.has('backlink')) continue;
      const href = anchor.getAttribute('href')?.trim() ?? '';
      const target = resolveInternalTarget(loaded, read, item.resolvedPath, href);
      if (!target) {
        issues.push(createIssue({
          code: types.has('noteref') ? 'CONTENT_FOOTNOTE_INVALID_TARGET' :
            'CONTENT_FOOTNOTE_BACKLINK_INVALID',
          severity: 'warning',
          title: types.has('noteref') ? 'Nota de rodapé sem destino acessível' :
            'Backlink de nota sem destino acessível',
          detail: 'A remissão editorial "' + href + '" não aponta para âncora ' +
            'XHTML local válida. Não é seguro inventar uma correção automática.',
          file: item.resolvedPath,
          context: href || 'href ausente',
          repairable: false,
        }));
        continue;
      }
      if (types.has('noteref')) {
        let element: Element | null = target;
        let isNote = false;
        while (element) {
          if (hasSemanticRole(element, NOTES)) {
            isNote = true;
            break;
          }
          element = element.parentElement;
        }
        if (!isNote) {
          issues.push(createIssue({
            code: 'CONTENT_FOOTNOTE_SEMANTICS_MISSING',
            severity: 'info',
            title: 'Nota sem semântica explícita no destino',
            detail: 'A âncora foi encontrada, mas não possui epub:type/role de nota ' +
              'nem ancestral anotado. Confirme a estrutura editorial, sem alterar o texto.',
            file: item.resolvedPath,
            context: href,
            repairable: false,
          }));
        }
      } else if (!semanticTokens(target).has('noteref')) {
        issues.push(createIssue({
          code: 'CONTENT_FOOTNOTE_BACKLINK_INVALID',
          severity: 'warning',
          title: 'Backlink retorna a elemento que não é noteref',
          detail: 'O link de retorno existe, mas não aponta para uma âncora ' +
            'identificada semanticamente como noteref.',
          file: item.resolvedPath,
          context: href,
          repairable: false,
        }));
      }
    }
  }
  return issues;
}
