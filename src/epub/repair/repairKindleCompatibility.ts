import type { ManifestItem, PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction } from '../model/repairTypes';
import { HTML_MEDIA_TYPES } from '../utils/constants';
import { normalizeLanguageTag } from '../utils/kindleCompatibility';
import { basename, dirname, relativePath, resolveReference } from '../utils/pathUtils';
import {
  childElementsByLocalName,
  findByLocalName,
  getAttr,
  parseXml,
  serializeXml,
} from '../utils/xmlUtils';

const TEXT_DECODER = new TextDecoder('utf-8', { fatal: false });
const TEXT_ENCODER = new TextEncoder();

export function repairKindleCompatibility(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
): RepairAction[] {
  return [...repairNcxCompatibility(files, pkg), ...repairXhtmlCompatibility(files, pkg)];
}

function repairNcxCompatibility(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
): RepairAction[] {
  const actions: RepairAction[] = [];
  if (!pkg.ncxItem?.exists) return actions;

  const bytes = files.get(pkg.ncxItem.resolvedPath);
  if (!bytes) return actions;

  let doc: Document;
  try {
    doc = parseXml(TEXT_DECODER.decode(bytes));
  } catch {
    return actions;
  }

  const navMap = findByLocalName(doc, 'navMap')[0];
  const existingPaths = collectNcxContentPaths(doc, pkg.ncxItem.resolvedPath, files);
  const missingSpineItems = pkg.spine
    .map((item, index) => ({ index, item: item.manifestItem }))
    .filter((entry): entry is { index: number; item: ManifestItem } =>
      Boolean(
        entry.item?.exists &&
        HTML_MEDIA_TYPES.has(entry.item.mediaType) &&
        !existingPaths.has(entry.item.resolvedPath),
      ),
    );

  let addedMissingSpineItems = 0;
  if (navMap && missingSpineItems.length > 0) {
    for (const { index, item } of missingSpineItems) {
      const navPoint = createNcxNavPoint(doc, pkg, item.resolvedPath, index + 1, files);
      const before = findFirstNavPointAfterSpineIndex(navMap, pkg, item.resolvedPath);
      if (before) navMap.insertBefore(navPoint, before);
      else navMap.append(navPoint);
      addedMissingSpineItems += 1;
      existingPaths.add(item.resolvedPath);
    }
  }

  const navPoints = findByLocalName(doc, 'navPoint');
  let playOrderChanged = false;

  navPoints.forEach((navPoint, index) => {
    const expected = String(index + 1);
    if (getAttr(navPoint, 'playOrder') !== expected) {
      navPoint.setAttribute('playOrder', expected);
      playOrderChanged = true;
    }
  });

  const titleChanged = normalizeNcxTitle(doc, pkg.metadata.title);
  if (playOrderChanged || titleChanged || addedMissingSpineItems > 0) {
    files.set(pkg.ncxItem.resolvedPath, TEXT_ENCODER.encode(serializeXml(doc)));
  }

  if (playOrderChanged) {
    actions.push({
      type: 'normalized',
      title: 'playOrder do NCX normalizado',
      detail: 'Os navPoints do toc.ncx foram renumerados em sequência limpa.',
      file: pkg.ncxItem.resolvedPath,
    });
  }

  if (addedMissingSpineItems > 0) {
    actions.push({
      type: 'updated',
      title: 'Itens do spine adicionados ao NCX',
      detail:
        addedMissingSpineItems === 1
          ? 'Um documento da ordem de leitura foi adicionado ao toc.ncx.'
          : `${addedMissingSpineItems} documentos da ordem de leitura foram adicionados ao toc.ncx.`,
      file: pkg.ncxItem.resolvedPath,
    });
  }

  if (titleChanged) {
    actions.push({
      type: 'updated',
      title: 'Título do NCX ajustado',
      detail:
        'O título do documento NCX foi alinhado ao título do OPF quando estava vazio ou genérico.',
      file: pkg.ncxItem.resolvedPath,
    });
  }

  return actions;
}

function repairXhtmlCompatibility(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
): RepairAction[] {
  const actions: RepairAction[] = [];
  const language = normalizeLanguageTag(pkg.metadata.language, 'pt-BR');

  for (const item of pkg.manifest) {
    if (!item.exists || !HTML_MEDIA_TYPES.has(item.mediaType)) continue;

    const bytes = files.get(item.resolvedPath);
    if (!bytes) continue;

    const original = TEXT_DECODER.decode(bytes);
    let output = original;
    const fileActions: RepairAction[] = [];

    if (/&nbsp;/iu.test(output)) {
      output = output.replace(/&nbsp;/giu, '&#160;');
      fileActions.push({
        type: 'updated',
        title: 'Entidade &nbsp; normalizada',
        detail:
          'As entidades &nbsp; foram substituídas por &#160; para evitar falhas de parsing XML.',
        file: item.resolvedPath,
      });
    }

    const withLanguage = ensureHtmlLanguage(output, language);
    if (withLanguage !== output) {
      output = withLanguage;
      fileActions.push({
        type: 'updated',
        title: 'Idioma declarado no XHTML',
        detail: `A tag html recebeu lang/xml:lang="${language}" para melhorar compatibilidade e acessibilidade.`,
        file: item.resolvedPath,
      });
    }

    const withContentType = normalizeContentTypeMeta(output);
    if (withContentType !== output) {
      output = withContentType;
      fileActions.push({
        type: 'updated',
        title: 'Meta Content-Type normalizado',
        detail: 'Metadados Content-Type suspeitos foram normalizados para XHTML UTF-8.',
        file: item.resolvedPath,
      });
    }

    if (output !== original) {
      files.set(item.resolvedPath, TEXT_ENCODER.encode(output));
      actions.push(...fileActions);
    }
  }

  return actions;
}

function collectNcxContentPaths(
  doc: Document,
  ncxPath: string,
  files: Map<string, Uint8Array>,
): Set<string> {
  const paths = new Set<string>();
  for (const content of findByLocalName(doc, 'content')) {
    const src = getAttr(content, 'src');
    if (!src) continue;
    const resolved = resolveReference(ncxPath, src);
    if (resolved.safe && files.has(resolved.path)) paths.add(resolved.path);
  }
  return paths;
}

function createNcxNavPoint(
  doc: Document,
  pkg: PackageDocumentInfo,
  contentPath: string,
  spinePosition: number,
  files: Map<string, Uint8Array>,
): Element {
  const namespace = doc.documentElement.namespaceURI || 'http://www.daisy.org/z3986/2005/ncx/';
  const navPoint = doc.createElementNS(namespace, 'navPoint');
  navPoint.setAttribute('id', makeNcxId(contentPath, spinePosition));
  navPoint.setAttribute('playOrder', String(spinePosition));

  const navLabel = doc.createElementNS(namespace, 'navLabel');
  const text = doc.createElementNS(namespace, 'text');
  text.textContent = inferNcxLabel(contentPath, files);
  navLabel.append(text);
  navPoint.append(navLabel);

  const content = doc.createElementNS(namespace, 'content');
  content.setAttribute(
    'src',
    relativePath(dirname(pkg.ncxItem?.resolvedPath ?? pkg.opfPath), contentPath),
  );
  navPoint.append(content);

  return navPoint;
}

function findFirstNavPointAfterSpineIndex(
  navMap: Element,
  pkg: PackageDocumentInfo,
  contentPath: string,
): Element | undefined {
  const targetIndex = spineIndexForPath(pkg, contentPath);
  if (targetIndex < 0) return undefined;

  return childElementsByLocalName(navMap, 'navPoint').find((navPoint) => {
    const content = childElementsByLocalName(navPoint, 'content')[0];
    const src = getAttr(content, 'src');
    if (!src || !pkg.ncxItem) return false;
    const resolved = resolveReference(pkg.ncxItem.resolvedPath, src);
    return resolved.safe && spineIndexForPath(pkg, resolved.path) > targetIndex;
  });
}

function spineIndexForPath(pkg: PackageDocumentInfo, contentPath: string): number {
  return pkg.spine.findIndex((spineItem) => spineItem.manifestItem?.resolvedPath === contentPath);
}

function inferNcxLabel(contentPath: string, files: Map<string, Uint8Array>): string {
  const bytes = files.get(contentPath);
  if (bytes) {
    const text = TEXT_DECODER.decode(bytes);
    const title = stripTags(readFirstMatch(text, /<title\b[^>]*>([\s\S]*?)<\/title\s*>/iu));
    if (title && !/^untitled$/iu.test(title)) return title;

    const heading = stripTags(readFirstMatch(text, /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]\s*>/iu));
    if (heading) return heading;
  }

  return (
    basename(contentPath)
      .replace(/\.[^.]+$/u, '')
      .replace(/[-_]+/gu, ' ')
      .trim() || 'Seção'
  );
}

function readFirstMatch(text: string, pattern: RegExp): string | undefined {
  return pattern.exec(text)?.[1]?.trim() || undefined;
}

function stripTags(text: string | undefined): string | undefined {
  return text
    ?.replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function makeNcxId(contentPath: string, spinePosition: number): string {
  return `epub-repair-spine-${spinePosition}-${basename(contentPath)
    .replace(/\.[^.]+$/u, '')
    .replace(/[^a-zA-Z0-9_-]+/gu, '-')}`;
}

function normalizeNcxTitle(doc: Document, title: string | undefined): boolean {
  const normalizedTitle = title?.trim();
  if (!normalizedTitle) return false;

  const docTitle = findByLocalName(doc, 'docTitle')[0];
  if (!docTitle) return false;

  const textElement = childElementsByLocalName(docTitle, 'text')[0];
  if (!textElement) return false;

  const current = textElement.textContent?.trim() ?? '';
  if (current && !/^(?:untitled|unknown|sem título)$/iu.test(current)) return false;

  textElement.textContent = normalizedTitle;
  return true;
}

function ensureHtmlLanguage(text: string, language: string): string {
  return text.replace(/<html\b([^>]*)>/iu, (_full, attrs: string) => {
    let nextAttrs = attrs;
    nextAttrs = upsertLanguageAttribute(nextAttrs, 'xml:lang', language);
    nextAttrs = upsertLanguageAttribute(nextAttrs, 'lang', language);
    return `<html${nextAttrs.trimEnd()}>`;
  });
}

function upsertLanguageAttribute(attrs: string, name: string, language: string): string {
  const escaped = escapeAttribute(language);
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'iu');
  if (pattern.test(attrs)) {
    return attrs.replace(pattern, (_match, quote: string, value: string) => {
      if (value.trim()) return ` ${name}=${quote}${value}${quote}`;
      return ` ${name}=${quote}${escaped}${quote}`;
    });
  }
  return `${attrs} ${name}="${escaped}"`;
}

function normalizeContentTypeMeta(text: string): string {
  return text.replace(/<meta\b[^>]*http-equiv\s*=\s*(["'])?content-type\1?[^>]*>/giu, (meta) => {
    const content = readAttribute(meta, 'content');
    if (!content) return meta;

    const normalized = content.trim().toLowerCase();
    const valid = /^(?:application\/xhtml\+xml|text\/html)(?:\s*;\s*charset\s*=\s*[-\w]+)?$/iu.test(
      normalized,
    );
    if (valid) return meta;

    return '<meta http-equiv="Content-Type" content="application/xhtml+xml; charset=utf-8" />';
  });
}

function readAttribute(tag: string, name: string): string | undefined {
  const pattern = new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, 'iu');
  return pattern.exec(tag)?.[2]?.trim() || undefined;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;');
}
