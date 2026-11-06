import type { PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction } from '../model/repairTypes';
import { basename, encodePathForXml, makeUniqueId, relativePath, resolveReference } from '../utils/pathUtils';
import { decodeUtf8ForRewrite } from '../utils/textEncoding';
import { parseXml, serializeXmlPreservingDeclaration } from '../utils/xmlUtils';
import { replaceLocalReference, updateCoverReferences } from './updateCoverReferences';

const OPF_NS = 'http://www.idpf.org/2007/opf';

/** Um CSS compartilhado não pode receber uma nova imagem sem alterar capítulos.
 * Criamos CSS exclusivo para a capa e redirecionamos apenas seu <link>.
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
  const usedIds = new Set(Array.from(manifest.children)
    .map((item) => item.getAttribute('id') ?? '').filter(Boolean));
  for (const css of sharedStyles) {
    const original = pkg.manifest.find((item) => item.resolvedPath === css && item.exists);
    if (!original || !files.has(css) ||
        ![...(consumers.get(css) ?? [])].some((path) => coverPages.has(path))) continue;
    const proposed = css.replace(/\.css$/iu, '.epub-cover.css');
    let clone = proposed;
    for (let n = 2; files.has(clone); n += 1) {
      clone = proposed.replace(/\.css$/iu, '-' + n + '.css');
    }
    files.set(clone, files.get(css)!);
    const fakePkg: PackageDocumentInfo = {
      ...pkg,
      manifest: [{ ...original, resolvedPath: clone, exists: true }],
    };
    const rewrites = updateCoverReferences(files, fakePkg, oldCoverPath, newCoverPath,
      new Set([clone]));
    if (rewrites.length === 0) {
      files.delete(clone);
      continue;
    }
    const pageChanges: Array<[string, string]> = [];
    for (const page of coverPages) {
      if (!consumers.get(css)?.has(page)) continue;
      const bytes = files.get(page);
      if (!bytes) continue;
      const originalPage = decodeUtf8ForRewrite(bytes, page);
      const isHtml = /\.html$/iu.test(page) && !/\.xhtml$/iu.test(page);
      const parsed = isHtml
        ? new DOMParser().parseFromString(originalPage, 'text/html')
        : parseXml(originalPage, 'application/xhtml+xml');
      let changed = false;
      for (const element of Array.from(parsed.getElementsByTagName('*'))) {
        if (element.localName !== 'link' ||
          !(element.getAttribute('rel') ?? '').toLowerCase().split(/\s+/u).includes('stylesheet')) {
          continue;
        }
        const old = element.getAttribute('href') ?? '';
        if (resolveReference(page, old).path !== css) continue;
        element.setAttribute('href', replaceLocalReference(old, page, css, clone));
        changed = true;
      }
      if (!changed) continue;
      const next = isHtml
        ? (originalPage.match(/^\s*<!doctype[^>]*>/iu)?.[0] ?? '') +
          '\n' + parsed.documentElement.outerHTML
        : serializeXmlPreservingDeclaration(parsed, originalPage);
      pageChanges.push([page, next]);
    }
    if (pageChanges.length === 0) {
      files.delete(clone);
      continue;
    }
    for (const [page, text] of pageChanges) {
      files.set(page, new TextEncoder().encode(text));
      actions.push({
        type: 'updated', title: 'Estilo exclusivo da capa vinculado',
        detail: 'CSS compartilhado preservado nos capítulos; a capa usa cópia independente.',
        file: page,
      });
    }
    const item = opf.createElementNS(OPF_NS, 'item');
    item.setAttribute('id', makeUniqueId('cover-style-' + basename(css), usedIds));
    item.setAttribute('href', encodePathForXml(relativePath(pkg.opfDir, clone)));
    item.setAttribute('media-type', 'text/css');
    manifest.append(item);
    actions.push({
      type: 'created', title: 'CSS independente da capa criado',
      detail: 'Uma folha de estilos compartilhada foi duplicada sem tocar no original.',
      file: clone,
    });
  }
  return actions;
}
