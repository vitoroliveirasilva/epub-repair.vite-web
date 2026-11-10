import type { LoadedEpub } from '../model/epubTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction, RepairOptions } from '../model/repairTypes';
import { RELEVANT_MEDIA_TYPES, SYSTEM_FILE_PATTERNS } from '../utils/constants';
import { deriveTitleFromFileName } from '../utils/fileName';
import { decodeUtf8ForRewrite } from '../utils/textEncoding';
import {
  isInvalidOpfDate,
  normalizeOpfDate,
  findCoverImageCandidate,
} from '../utils/kindleCompatibility';
import { areEquivalentMediaTypes, guessMediaType } from '../utils/mediaTypes';
import {
  basename,
  encodePathForXml,
  makeUniqueId,
  relativePath,
  resolveFromDir,
  isSafeRemoteResourceUrl,
} from '../utils/pathUtils';
import {
  childElementsByLocalName,
  findFirstByLocalName,
  getAttr,
  parseXml,
  serializeXmlPreservingDeclaration,
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

  const opfSource = decodeUtf8ForRewrite(opfFile.bytes, pkg.opfPath);
  const doc = parseXml(opfSource);
  const packageElement = findFirstByLocalName(doc, 'package') ?? doc.documentElement;
  const metadata = ensureChild(doc, packageElement, 'metadata');
  const manifest = ensureChild(doc, packageElement, 'manifest');
  const spine = ensureChild(doc, packageElement, 'spine');
  const actions: RepairAction[] = [];
  const filesToAdd = new Map<string, string>();

  repairPackageVersion(packageElement, actions, pkg.opfPath);
  repairMetadata(doc, metadata, originalFileName, actions, pkg.opfPath);
  if (options.repairManifest) repairManifest(doc, manifest, loaded, pkg, actions);
  ensureCoverMetadata(doc, metadata, manifest, loaded, pkg, actions);
  if (options.repairSpine) repairSpine(spine, manifest, actions, pkg.opfPath);
  ensureNavigationFiles(doc, manifest, spine, loaded, pkg, filesToAdd, actions, options);

  return {
    opfText: serializeXmlPreservingDeclaration(doc, opfSource),
    filesToAdd,
    actions,
  };
}

function repairPackageVersion(
  packageElement: Element,
  actions: RepairAction[],
  opfPath: string,
): void {
  if ((packageElement.getAttribute('version') ?? '').trim() !== '1.0') return;

  packageElement.setAttribute('version', '2.0');
  actions.push({
    type: 'normalized',
    title: 'Versão OPF normalizada',
    detail: 'O pacote declarava version="1.0" e foi normalizado para version="2.0".',
    file: opfPath,
  });
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

  
  

  const date = findFirstByLocalName(metadata, 'date');
  const dateValue = date?.textContent?.trim();
  if (date && dateValue && isInvalidOpfDate(dateValue)) {
    const normalizedDate = normalizeOpfDate(dateValue);
    if (normalizedDate) {
      date.textContent = normalizedDate;
      actions.push({
        type: 'normalized',
        title: 'Data do OPF normalizada',
        detail: `A data "${dateValue}" foi normalizada para "${normalizedDate}".`,
        file: opfPath,
      });
    }
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
  const referencedIds = new Set<string>();
  for (const element of Array.from(doc.getElementsByTagName('*'))) {
    for (const attr of ['idref', 'fallback', 'media-overlay', 'toc']) {
      const target = getAttr(element, attr);
      if (target) referencedIds.add(target);
    }
    if (element.localName === 'meta' && getAttr(element, 'name') === 'cover') {
      const target = getAttr(element, 'content');
      if (target) referencedIds.add(target);
    }
    const refines = getAttr(element, 'refines');
    if (refines?.startsWith('#')) referencedIds.add(refines.slice(1));
  }

  for (const item of childElementsByLocalName(manifest, 'item')) {
    const href = getAttr(item, 'href') ?? '';
    const id = getAttr(item, 'id') ?? '';
    const parsedItem = pkg.manifest.find(
      (manifestItem) => manifestItem.href === href && manifestItem.id === id,
    );
    const remote = isSafeRemoteResourceUrl(href);
    const resolvedFromDocument = href && !remote ? resolveFromDir(pkg.opfDir, href) : undefined;
    const currentPath = remote ? href : parsedItem?.resolvedPath ?? resolvedFromDocument?.path;
    const mediaType = getAttr(item, 'media-type') ?? '';
    const shouldRemove =
      !href ||
      !currentPath ||
      resolvedFromDocument?.safe === false ||
      (!remote && !loaded.files.has(currentPath)) ||
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
    if (id && usedIds.has(id) && referencedIds.has(id)) {
      
      actions.push({
        type: 'skipped',
        title: 'ID duplicado exige revisão manual',
        detail: `O ID "${id}" é referenciado por outras partes do OPF; não foi renomeado.`,
        file: pkg.opfPath,
      });
    } else if (!id || usedIds.has(id)) {
      item.setAttribute('id', makeUniqueId(basename(href), usedIds));
      actions.push({
        type: 'updated',
        title: 'ID de manifest corrigido',
        detail: `O item "${href}" recebeu um id único sem quebrar referência existente.`,
        file: pkg.opfPath,
      });
    } else {
      usedIds.add(id);
    }

    const guessed = remote ? undefined : guessMediaType(currentPath);
    if (guessed && !areEquivalentMediaTypes(mediaType, guessed)) {
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
        return href
          ? isSafeRemoteResourceUrl(href) ? href : resolveFromDir(pkg.opfDir, href).path
          : '';
      })
      .filter(Boolean),
  );
  
  
  
  if (pkg.rootfileCount > 1) {
    actions.push({
      type: 'skipped',
      title: 'Manifest de outras renditions preservado',
      detail: 'O container possui múltiplos OPFs. Recursos não declarados no OPF ' +
        'ativo não serão adotados automaticamente, pois podem pertencer a outra rendition.',
      file: pkg.opfPath,
    });
    return;
  }

  for (const path of loaded.files.keys()) {
    if (path === 'mimetype' || path === 'META-INF/container.xml' || path === pkg.opfPath) continue;
    if (SYSTEM_FILE_PATTERNS.some((pattern) => pattern.test(path))) continue;
    const mediaType = guessMediaType(path);
    if (!mediaType || !RELEVANT_MEDIA_TYPES.has(mediaType)) continue;
    if (mediaType === 'text/javascript') {
      actions.push({
        type: 'skipped',
        title: 'Script sem declaração preservado para revisão',
        detail: 'O arquivo JS não foi inserido automaticamente no manifest.',
        file: path,
      });
      continue;
    }
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

function ensureCoverMetadata(
  doc: Document,
  metadata: Element,
  manifest: Element,
  loaded: LoadedEpub,
  pkg: PackageDocumentInfo,
  actions: RepairAction[],
): void {
  const manifestItems = childElementsByLocalName(manifest, 'item');
  const manifestIds = new Set(
    manifestItems.map((item) => getAttr(item, 'id') ?? '').filter(Boolean),
  );
  const coverMetas = childElementsByLocalName(metadata, 'meta').filter(
    (meta) => getAttr(meta, 'name') === 'cover',
  );
  const firstCoverMeta = coverMetas[0];
  const currentCoverId = firstCoverMeta?.getAttribute('content')?.trim() || undefined;

  if (currentCoverId && manifestIds.has(currentCoverId)) {
    removeExtraCoverMetas(coverMetas, actions, pkg.opfPath);
    return;
  }

  const coverCandidate = findCoverImageCandidate(pkg, loaded.files);
  const coverItem = coverCandidate
    ? manifestItems.find((item) => getAttr(item, 'id') === coverCandidate.id)
    : undefined;
  const coverId = coverItem ? getAttr(coverItem, 'id') : undefined;
  if (!coverItem || !coverId) return;

  const meta = firstCoverMeta ?? doc.createElementNS(OPF_NS, 'meta');
  meta.setAttribute('name', 'cover');
  meta.setAttribute('content', coverId);
  if (!firstCoverMeta) metadata.append(meta);

  if (pkg.version.startsWith('3')) addTokenAttribute(coverItem, 'properties', 'cover-image');
  removeExtraCoverMetas(coverMetas, actions, pkg.opfPath);

  actions.push({
    type: firstCoverMeta ? 'updated' : 'created',
    title: 'Metadado de capa ajustado',
    detail: `O OPF agora declara "${coverId}" como imagem de capa para leitores Kindle.`,
    file: pkg.opfPath,
  });
}

function removeExtraCoverMetas(
  coverMetas: Element[],
  actions: RepairAction[],
  opfPath: string,
): void {
  const extras = coverMetas.slice(1);
  if (extras.length === 0) return;
  for (const extra of extras) extra.remove();
  actions.push({
    type: 'removed',
    title: 'Metadados de capa duplicados removidos',
    detail: 'Metas name="cover" duplicados foram removidos para evitar ambiguidade.',
    file: opfPath,
  });
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
    actions.push({
      type: 'skipped',
      title: 'Spine sem ordem de leitura confiável',
      detail: 'Não é possível inferir a ordem editorial a partir do manifest. Requer revisão manual.',
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
    const navPath = uniqueGeneratedPath(
      pkg.navItem?.resolvedPath || `${pkg.opfDir ? `${pkg.opfDir}/` : ''}nav.xhtml`,
      loaded, filesToAdd,
    );
    filesToAdd.set(navPath, buildNavDocument(pkg, navPath, loaded.files));
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
    const ncxPath = uniqueGeneratedPath(
      pkg.ncxItem?.resolvedPath || `${pkg.opfDir ? `${pkg.opfDir}/` : ''}toc.ncx`,
      loaded, filesToAdd,
    );
    const ncxId = makeUniqueId(pkg.ncxItem?.id || 'ncx', usedIds);
    filesToAdd.set(ncxPath, buildNcxDocument(pkg, ncxPath, loaded.files));
    
    if (!childElementsByLocalName(manifest, 'item').some((item) => getAttr(item, 'id') === ncxId)) {
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

 
function uniqueGeneratedPath(
  preferred: string,
  loaded: LoadedEpub,
  pending: ReadonlyMap<string, string>,
): string {
  if (!loaded.files.has(preferred) && !pending.has(preferred)) return preferred;
  const dot = preferred.lastIndexOf('.');
  const stem = dot < 0 ? preferred : preferred.slice(0, dot);
  const extension = dot < 0 ? '' : preferred.slice(dot);
  for (let number = 2; number <= 10000; number += 1) {
    const candidate = stem + '-' + number + extension;
    if (!loaded.files.has(candidate) && !pending.has(candidate)) return candidate;
  }
  throw new Error('Não há um caminho livre para gerar navegação sem sobrescrever arquivos existentes.');
}
