import type { LoadedEpub } from '../model/epubTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction, RepairOptions } from '../model/repairTypes';
import { HTML_MEDIA_TYPES, RELEVANT_MEDIA_TYPES, SYSTEM_FILE_PATTERNS } from '../utils/constants';
import { deriveTitleFromFileName } from '../utils/fileName';
import { guessMediaType } from '../utils/mediaTypes';
import {
  basename,
  encodePathForXml,
  makeUniqueId,
  relativePath,
  resolveFromDir,
} from '../utils/pathUtils';
import {
  childElementsByLocalName,
  findFirstByLocalName,
  getAttr,
  parseXml,
  serializeXml,
} from '../utils/xmlUtils';
import {
  buildNavDocument,
  buildNcxDocument,
  shouldCreateNav,
  shouldCreateNcx,
} from './repairNavigation';

const OPF_NS = 'http://www.idpf.org/2007/opf';
const DC_NS = 'http://purl.org/dc/elements/1.1/';

export interface OpfRepairResult {
  opfText: string;
  filesToAdd: Map<string, string>;
  actions: RepairAction[];
}

export function repairOpfDocument(
  loaded: LoadedEpub,
  pkg: PackageDocumentInfo,
  originalFileName: string,
  options: Pick<
    RepairOptions,
    'repairManifest' | 'repairSpine' | 'generateNavigation' | 'generateNcx'
  >,
): OpfRepairResult {
  const opfFile = loaded.files.get(pkg.opfPath);
  if (!opfFile) throw new Error('OPF não encontrado para reparo.');

  const doc = parseXml(new TextDecoder('utf-8', { fatal: false }).decode(opfFile.bytes));
  const packageElement = findFirstByLocalName(doc, 'package') ?? doc.documentElement;
  const metadata = ensureChild(doc, packageElement, 'metadata');
  const manifest = ensureChild(doc, packageElement, 'manifest');
  const spine = ensureChild(doc, packageElement, 'spine');
  const actions: RepairAction[] = [];
  const filesToAdd = new Map<string, string>();

  repairMetadata(doc, metadata, originalFileName, actions, pkg.opfPath);
  if (options.repairManifest) repairManifest(doc, manifest, loaded, pkg, actions);
  if (options.repairSpine) repairSpine(spine, manifest, actions, pkg.opfPath);
  ensureNavigationFiles(doc, manifest, spine, loaded, pkg, filesToAdd, actions, options);

  return {
    opfText: serializeXml(doc),
    filesToAdd,
    actions,
  };
}

function repairMetadata(
  doc: Document,
  metadata: Element,
  originalFileName: string,
  actions: RepairAction[],
  opfPath: string,
): void {
  if (!findFirstByLocalName(metadata, 'title')?.textContent?.trim()) {
    const title = doc.createElementNS(DC_NS, 'dc:title');
    title.textContent = deriveTitleFromFileName(originalFileName);
    metadata.append(title);
    actions.push({
      type: 'updated',
      title: 'Título básico adicionado',
      detail: 'O título foi derivado do nome do arquivo original.',
      file: opfPath,
    });
  }

  if (!findFirstByLocalName(metadata, 'language')?.textContent?.trim()) {
    const language = doc.createElementNS(DC_NS, 'dc:language');
    language.textContent = 'pt-BR';
    metadata.append(language);
    actions.push({
      type: 'updated',
      title: 'Idioma padrão adicionado',
      detail: 'Foi usado pt-BR somente porque o OPF não informava idioma.',
      file: opfPath,
    });
  }

  if (!findFirstByLocalName(metadata, 'identifier')?.textContent?.trim()) {
    const identifier = doc.createElementNS(DC_NS, 'dc:identifier');
    identifier.setAttribute('id', 'epub-repair-uid');
    identifier.textContent = `urn:uuid:${crypto.randomUUID()}`;
    metadata.append(identifier);
    const packageElement = findFirstByLocalName(doc, 'package');
    packageElement?.setAttribute('unique-identifier', 'epub-repair-uid');
    actions.push({
      type: 'updated',
      title: 'Identificador básico adicionado',
      detail: 'Foi criado um identificador UUID para evitar pacote sem ID.',
      file: opfPath,
    });
  }
}

function repairManifest(
  doc: Document,
  manifest: Element,
  loaded: LoadedEpub,
  pkg: PackageDocumentInfo,
  actions: RepairAction[],
): void {
  const usedIds = new Set<string>();
  const seenHrefs = new Set<string>();

  for (const item of childElementsByLocalName(manifest, 'item')) {
    const href = getAttr(item, 'href') ?? '';
    const id = getAttr(item, 'id') ?? '';
    const parsedItem = pkg.manifest.find(
      (manifestItem) => manifestItem.href === href && manifestItem.id === id,
    );
    const resolvedFromDocument = href ? resolveFromDir(pkg.opfDir, href) : undefined;
    const currentPath = parsedItem?.resolvedPath ?? resolvedFromDocument?.path;
    const mediaType = getAttr(item, 'media-type') ?? '';
    const shouldRemove =
      !href ||
      !currentPath ||
      resolvedFromDocument?.safe === false ||
      !loaded.files.has(currentPath) ||
      seenHrefs.has(currentPath);

    if (shouldRemove) {
      item.remove();
      actions.push({
        type: 'removed',
        title: 'Item inválido removido do manifest',
        detail: href
          ? `O item "${href}" estava duplicado, inseguro ou apontava para arquivo inexistente.`
          : 'Um item sem href foi removido.',
        file: pkg.opfPath,
      });
      continue;
    }

    seenHrefs.add(currentPath);
    if (!id || usedIds.has(id)) {
      item.setAttribute('id', makeUniqueId(basename(href), usedIds));
      actions.push({
        type: 'updated',
        title: 'ID de manifest corrigido',
        detail: `O item "${href}" recebeu um id único.`,
        file: pkg.opfPath,
      });
    } else {
      usedIds.add(id);
    }

    const guessed = guessMediaType(currentPath);
    if (guessed && mediaType !== guessed && mediaType !== 'image/jpg') {
      item.setAttribute('media-type', guessed);
      actions.push({
        type: 'updated',
        title: 'Media type corrigido',
        detail: `O item "${href}" agora usa "${guessed}".`,
        file: pkg.opfPath,
      });
    }

    if (pkg.version.startsWith('3') && isNavCandidate(currentPath, getAttr(item, 'properties'))) {
      const added = addTokenAttribute(item, 'properties', 'nav');
      if (added) {
        actions.push({
          type: 'updated',
          title: 'Documento nav preservado no manifest',
          detail: `O item "${href}" já existia e recebeu properties="nav" em vez de recriar o índice.`,
          file: pkg.opfPath,
        });
      }
    }
  }

  const declaredPaths = new Set(
    childElementsByLocalName(manifest, 'item')
      .map((item) => {
        const href = getAttr(item, 'href');
        return href ? resolveFromDir(pkg.opfDir, href).path : '';
      })
      .filter(Boolean),
  );
  for (const path of loaded.files.keys()) {
    if (path === 'mimetype' || path === 'META-INF/container.xml' || path === pkg.opfPath) continue;
    if (SYSTEM_FILE_PATTERNS.some((pattern) => pattern.test(path))) continue;
    const mediaType = guessMediaType(path);
    if (!mediaType || !RELEVANT_MEDIA_TYPES.has(mediaType)) continue;
    const href = relativePath(pkg.opfDir, path);
    if (declaredPaths.has(path)) continue;
    const item = doc.createElementNS(OPF_NS, 'item');
    const id = makeUniqueId(basename(path), usedIds);
    item.setAttribute('id', id);
    item.setAttribute('href', encodePathForXml(href));
    item.setAttribute('media-type', mediaType);
    if (pkg.version.startsWith('3') && isNavCandidate(path, undefined)) {
      item.setAttribute('properties', 'nav');
    }
    manifest.append(item);
    declaredPaths.add(path);
    actions.push({
      type: 'updated',
      title: 'Recurso existente adicionado ao manifest',
      detail: `O arquivo "${path}" existia no EPUB, mas não estava declarado.`,
      file: pkg.opfPath,
    });
  }
}

function repairSpine(
  spine: Element,
  manifest: Element,
  actions: RepairAction[],
  opfPath: string,
): void {
  const manifestIds = new Set(
    childElementsByLocalName(manifest, 'item')
      .map((item) => getAttr(item, 'id') ?? '')
      .filter(Boolean),
  );
  for (const itemref of childElementsByLocalName(spine, 'itemref')) {
    const idref = getAttr(itemref, 'idref') ?? '';
    if (!idref || !manifestIds.has(idref)) {
      itemref.remove();
      actions.push({
        type: 'removed',
        title: 'Item inválido removido do spine',
        detail: `O itemref "${idref}" não existe no manifest.`,
        file: opfPath,
      });
    }
  }

  if (childElementsByLocalName(spine, 'itemref').length === 0) {
    for (const item of childElementsByLocalName(manifest, 'item')) {
      const mediaType = getAttr(item, 'media-type') ?? '';
      const properties = getAttr(item, 'properties') ?? '';
      if (!HTML_MEDIA_TYPES.has(mediaType) || /(^|\s)nav($|\s)/u.test(properties)) continue;
      const id = getAttr(item, 'id');
      if (!id) continue;
      const itemref = item.ownerDocument.createElementNS(OPF_NS, 'itemref');
      itemref.setAttribute('idref', id);
      spine.append(itemref);
    }
    actions.push({
      type: 'updated',
      title: 'Spine reconstruído',
      detail:
        'A ordem de leitura estava vazia e foi reconstruída com documentos HTML/XHTML existentes.',
      file: opfPath,
    });
  }
}

function ensureNavigationFiles(
  doc: Document,
  manifest: Element,
  spine: Element,
  loaded: LoadedEpub,
  pkg: PackageDocumentInfo,
  filesToAdd: Map<string, string>,
  actions: RepairAction[],
  options: Pick<RepairOptions, 'generateNavigation' | 'generateNcx'>,
): void {
  const usedIds = new Set(
    childElementsByLocalName(manifest, 'item')
      .map((item) => getAttr(item, 'id') ?? '')
      .filter(Boolean),
  );

  if (
    options.generateNavigation &&
    shouldCreateNav(pkg) &&
    !currentManifestNavExists(manifest, loaded, pkg, filesToAdd)
  ) {
    const navPath = pkg.navItem?.resolvedPath || `${pkg.opfDir ? `${pkg.opfDir}/` : ''}nav.xhtml`;
    filesToAdd.set(navPath, buildNavDocument(pkg, navPath));
    const item = doc.createElementNS(OPF_NS, 'item');
    item.setAttribute('id', makeUniqueId('nav', usedIds));
    item.setAttribute('href', encodePathForXml(relativePath(pkg.opfDir, navPath)));
    item.setAttribute('media-type', 'application/xhtml+xml');
    item.setAttribute('properties', 'nav');
    manifest.append(item);
    actions.push({
      type: 'created',
      title: 'nav.xhtml criado',
      detail: 'Foi criado um documento de navegação EPUB 3 básico porque ele estava ausente.',
      file: navPath,
    });
  }

  const currentNcxId = currentManifestNcxId(manifest, loaded, pkg, filesToAdd);
  if (options.generateNcx && currentNcxId && !getAttr(spine, 'toc')) {
    spine.setAttribute('toc', currentNcxId);
    actions.push({
      type: 'updated',
      title: 'NCX existente preservado no spine',
      detail: 'Um toc.ncx existente foi reaproveitado em vez de recriar a navegação legada.',
      file: pkg.opfPath,
    });
  }

  if (options.generateNcx && shouldCreateNcx(pkg) && !currentNcxId) {
    const ncxPath = pkg.ncxItem?.resolvedPath || `${pkg.opfDir ? `${pkg.opfDir}/` : ''}toc.ncx`;
    const ncxId = pkg.ncxItem?.id || makeUniqueId('ncx', usedIds);
    filesToAdd.set(ncxPath, buildNcxDocument(pkg, ncxPath));
    if (!pkg.ncxItem) {
      const item = doc.createElementNS(OPF_NS, 'item');
      item.setAttribute('id', ncxId);
      item.setAttribute('href', encodePathForXml(relativePath(pkg.opfDir, ncxPath)));
      item.setAttribute('media-type', 'application/x-dtbncx+xml');
      manifest.append(item);
    }
    spine.setAttribute('toc', ncxId);
    actions.push({
      type: 'created',
      title: 'toc.ncx criado',
      detail: pkg.version.startsWith('3')
        ? 'O NCX declarado estava ausente e foi recriado.'
        : 'EPUB 2 precisa de NCX para navegação legada.',
      file: ncxPath,
    });
  }
}

function isNavCandidate(path: string, properties: string | undefined): boolean {
  return (
    /(^|\s)nav($|\s)/u.test(properties ?? '') ||
    path.toLowerCase().endsWith('/nav.xhtml') ||
    path.toLowerCase() === 'nav.xhtml'
  );
}

function addTokenAttribute(element: Element, attribute: string, token: string): boolean {
  const tokens = new Set((getAttr(element, attribute) ?? '').split(/\s+/u).filter(Boolean));
  if (tokens.has(token)) return false;
  tokens.add(token);
  element.setAttribute(attribute, Array.from(tokens).join(' '));
  return true;
}

function currentManifestNavExists(
  manifest: Element,
  loaded: LoadedEpub,
  pkg: PackageDocumentInfo,
  filesToAdd: Map<string, string>,
): boolean {
  return childElementsByLocalName(manifest, 'item').some((item) => {
    if (!/(^|\s)nav($|\s)/u.test(getAttr(item, 'properties') ?? '')) return false;
    const href = getAttr(item, 'href');
    if (!href) return false;
    const resolved = resolveFromDir(pkg.opfDir, href);
    return resolved.safe && (loaded.files.has(resolved.path) || filesToAdd.has(resolved.path));
  });
}

function currentManifestNcxId(
  manifest: Element,
  loaded: LoadedEpub,
  pkg: PackageDocumentInfo,
  filesToAdd: Map<string, string>,
): string | undefined {
  for (const item of childElementsByLocalName(manifest, 'item')) {
    if (getAttr(item, 'media-type') !== 'application/x-dtbncx+xml') continue;
    const href = getAttr(item, 'href');
    const id = getAttr(item, 'id');
    if (!href || !id) continue;
    const resolved = resolveFromDir(pkg.opfDir, href);
    if (resolved.safe && (loaded.files.has(resolved.path) || filesToAdd.has(resolved.path))) {
      return id;
    }
  }
  return undefined;
}

function ensureChild(doc: Document, parent: Element, localName: string): Element {
  const existing = childElementsByLocalName(parent, localName)[0];
  if (existing) return existing;
  const created = doc.createElementNS(OPF_NS, localName);
  parent.append(created);
  return created;
}
