import type { PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction } from '../model/repairTypes';
import { basename, decodeCssEscapes, encodePathForXml, makeUniqueId, relativePath, resolveReference } from '../utils/pathUtils';
import { cssCodePosition } from '../utils/cssContexts';
import { decodeUtf8ForRewrite } from '../utils/textEncoding';
import { parseXml, serializeXmlPreservingDeclaration } from '../utils/xmlUtils';
import { extractCssResourceReferences } from '../validation/referenceExtractor';
import { replaceLocalReference, updateCoverReferences } from './updateCoverReferences';

const OPF_NS = 'http://www.idpf.org/2007/opf';
const encoder = new TextEncoder();

/**
 * Preserva estilos e ilustrações de capítulos: uma referência de capa contida
 * em CSS compartilhado é modificada apenas em cópias dos CSS no caminho de
 * @import até a folha principal utilizada pela página de rosto.
 */
export function forkSharedCoverStyles(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
  opf: Document,
  coverPages: ReadonlySet<string>,
  sharedStyles: ReadonlySet<string>,
  consumers: ReadonlyMap<string, ReadonlySet<string>>,
  oldCoverPath: string,
  newCoverPath: string,
): RepairAction[] {
  const actions: RepairAction[] = [];
  const manifest = Array.from(opf.getElementsByTagName('*'))
    .find((node) => node.localName === 'manifest');
  if (!manifest) return actions;
  const declared = pkg.manifest.filter((item) =>
    item.exists && item.mediaType === 'text/css' && files.has(item.resolvedPath));
  const imports = new Map<string, string[]>();
  const sources = new Map<string, string>();
  const declaredPaths = new Set(declared.map((item) => item.resolvedPath));
  for (const item of declared) {
    const path = item.resolvedPath;
    try {
      const source = decodeUtf8ForRewrite(files.get(path)!, path);
      sources.set(path, source);
      imports.set(path, extractCssResourceReferences(source)
        .filter((ref) => ref.attr === 'css:import')
        .map((ref) => resolveReference(path, decodeCssEscapes(ref.raw)))
        .filter((ref) => ref.safe && declaredPaths.has(ref.path))
        .map((ref) => ref.path));
    } catch {
      // Arquivo ilegível não deve ser reescrito, adivinhado ou descartado.
    }
  }

  const consumedByCover = (css: string): boolean =>
    [...(consumers.get(css) ?? [])].some((page) => coverPages.has(page));
  const affected = new Set<string>();
  for (const path of sharedStyles) {
    const source = sources.get(path);
    if (!source || !consumedByCover(path)) continue;
    const references = extractCssResourceReferences(source);
    if (references.some((ref) =>
      ref.attr === 'css:url' &&
      resolveReference(path, decodeCssEscapes(ref.raw)).path === oldCoverPath)) {
      affected.add(path);
    }
  }
  // Propagar até CSS diretamente vinculados nas páginas. Não reescrever CSS
  // original usado por qualquer capítulo, mesmo em múltiplos níveis de import.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [path, dependencies] of imports) {
      if (!affected.has(path) && consumedByCover(path) &&
          dependencies.some((target) => affected.has(target))) {
        affected.add(path);
        changed = true;
      }
    }
  }
  if (affected.size === 0) return actions;

  const aliases = new Map<string, string>();
  for (const path of affected) {
    const prefix = path.replace(/\.css$/iu, '.epub-cover');
    let candidate = prefix + '.css';
    for (let index = 2; files.has(candidate); index += 1) {
      candidate = prefix + '-' + index + '.css';
    }
    aliases.set(path, candidate);
    files.set(candidate, files.get(path)!);
  }

  for (const [path, clone] of aliases) {
    const item = declared.find((entry) => entry.resolvedPath === path)!;
    const fakePkg: PackageDocumentInfo = {
      ...pkg,
      manifest: [{ ...item, resolvedPath: clone, exists: true }],
    };
    actions.push(...updateCoverReferences(files, fakePkg, oldCoverPath, newCoverPath,
      new Set([clone])));
    const clonedBytes = files.get(clone)!;
    const text = decodeUtf8ForRewrite(clonedBytes, clone);
    const rewritten = updateCssImports(text, path, aliases);
    if (rewritten !== text) files.set(clone, encoder.encode(rewritten));
  }

  const pageChanges: Array<[string, string]> = [];
  for (const page of coverPages) {
    const bytes = files.get(page);
    if (!bytes) continue;
    const originalPage = decodeUtf8ForRewrite(bytes, page);
    const isHtml = /\.html?$/iu.test(page) && !/\.xhtml$/iu.test(page);
    const document = isHtml
      ? new DOMParser().parseFromString(originalPage, 'text/html')
      : parseXml(originalPage, 'application/xhtml+xml');
    let pageChanged = false;
    for (const link of Array.from(document.getElementsByTagName('*'))) {
      if (link.localName !== 'link' ||
          !(link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/u).includes('stylesheet')) continue;
      const href = link.getAttribute('href') ?? '';
      const css = resolveReference(page, href);
      const clone = aliases.get(css.path);
      if (!css.safe || !clone) continue;
      link.setAttribute('href', replaceLocalReference(href, page, css.path, clone));
      pageChanged = true;
    }
    if (!pageChanged) continue;
    const rewritten = isHtml
      ? (originalPage.match(/^\s*<!doctype[^>]*>/iu)?.[0] ?? '') +
        '\n' + document.documentElement.outerHTML
      : serializeXmlPreservingDeclaration(document, originalPage);
    pageChanges.push([page, rewritten]);
  }

  // Não publicar folhas clonadas que não puderam ser vinculadas à capa.
  if (pageChanges.length === 0) {
    for (const clone of aliases.values()) files.delete(clone);
    return [];
  }
  for (const [page, text] of pageChanges) {
    files.set(page, encoder.encode(text));
    actions.push({
      type: 'updated',
      title: 'Estilo exclusivo da capa vinculado',
      detail: 'Folhas CSS compartilhadas e importadas permanecem intactas nos capítulos.',
      file: page,
    });
  }
  const usedIds = new Set(Array.from(manifest.children)
    .map((element) => element.getAttribute('id') ?? '').filter(Boolean));
  for (const [path, clone] of aliases) {
    const item = declared.find((entry) => entry.resolvedPath === path)!;
    const entry = opf.createElementNS(OPF_NS, 'item');
    entry.setAttribute('id', makeUniqueId('cover-style-' + basename(path), usedIds));
    entry.setAttribute('href', encodePathForXml(relativePath(pkg.opfDir, clone)));
    entry.setAttribute('media-type', 'text/css');
    if (item.properties.length > 0) entry.setAttribute('properties', item.properties.join(' '));
    manifest.append(entry);
    actions.push({
      type: 'created',
      title: 'CSS independente da capa criado',
      detail: 'Folha clonada para a capa sem modificar arquivos CSS dos capítulos.',
      file: clone,
    });
  }
  return actions;
}

function updateCssImports(source: string, basePath: string,
  aliases: ReadonlyMap<string, string>): string {
  const isCode = cssCodePosition(source);
  return source.replace(
    /@import\s+(?:url\(\s*(?:(['"])(.*?)\1|([^'"\s)]+))\s*\)|(['"])(.*?)\4)/giu,
    (full, _quote: string, quoted: string, unquoted: string,
      _directQuote: string, direct: string, offset: number) => {
      if (!isCode(offset)) return full;
      const raw = quoted || unquoted || direct || '';
      const resolved = resolveReference(basePath, decodeCssEscapes(raw));
      const alias = resolved.safe ? aliases.get(resolved.path) : undefined;
      if (!alias) return full;
      return full.replace(raw, replaceLocalReference(
        decodeCssEscapes(raw), basePath, resolved.path, alias));
    },
  );
}
