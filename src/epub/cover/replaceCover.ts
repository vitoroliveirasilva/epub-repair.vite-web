import type { LoadedEpub } from '../model/epubTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction, RepairResult } from '../model/repairTypes';
import { loadEpub } from '../reader/loadEpub';
import { rebuildEpubZip } from '../repair/rebuildEpubZip';
import { inspectEpub } from '../validation/validateEpub';
import { parsePackageDocument } from '../validation/opfParser';
import { makeRepairedFileName } from '../utils/fileName';
import { guessMediaType } from '../utils/mediaTypes';
import {
  basename,
  encodePathForXml,
  makeUniqueId,
  relativePath,
  resolveFromDir,
} from '../utils/pathUtils';
import { canRepairReport, getOptionalOptimizationCount } from '../utils/reportGuards';
import {
  childElementsByLocalName,
  findFirstByLocalName,
  getAttr,
  parseXml,
  serializeXml,
} from '../utils/xmlUtils';
import type { CoverImageInput, SupportedCoverMediaType } from './coverImageInput';

const OPF_NS = 'http://www.idpf.org/2007/opf';
const SUPPORTED_COVER_MEDIA_TYPES = new Set<string>(['image/jpeg', 'image/png']);

interface CoverTarget {
  path: string;
  item?: Element | undefined;
  id?: string | undefined;
  source: 'manifest-cover' | 'opf-meta' | 'guide' | 'filename-candidate';
}

export async function replaceEpubCover(
  fileName: string,
  bytes: Uint8Array,
  coverImage: CoverImageInput,
): Promise<RepairResult> {
  const before = await inspectEpub(fileName, bytes);
  const loaded = await loadEpub(fileName, bytes);

  if (!loaded.validZip) {
    throw new Error(
      'Não é seguro trocar a capa: o arquivo não pôde ser aberto como ZIP/EPUB válido.',
    );
  }

  const parsed = parsePackageDocument(loaded);
  if (!parsed.packageInfo) {
    throw new Error(
      'Não é seguro trocar a capa: o OPF do EPUB não foi encontrado ou está inválido.',
    );
  }

  const opfFile = loaded.files.get(parsed.packageInfo.opfPath);
  if (!opfFile) throw new Error('OPF não encontrado para troca de capa.');

  const files = cloneLoadedFiles(loaded);
  const doc = parseXml(new TextDecoder('utf-8', { fatal: false }).decode(opfFile.bytes));
  const packageElement = findFirstByLocalName(doc, 'package') ?? doc.documentElement;
  const metadata = ensureChild(doc, packageElement, 'metadata');
  const manifest = ensureChild(doc, packageElement, 'manifest');
  const target = findCoverTarget(doc, parsed.packageInfo, files);
  const canReplaceInPlace = Boolean(
    target?.path && coverPathMatchesMediaType(target.path, coverImage.mediaType),
  );
  const coverPath = canReplaceInPlace
    ? target!.path
    : makeUniqueCoverPath(files, parsed.packageInfo, coverImage.mediaType);
  const coverItem =
    canReplaceInPlace && target?.item
      ? target.item
      : createOrFindManifestItem(doc, manifest, parsed.packageInfo, coverPath);
  const coverId = ensureManifestCoverItem(
    coverItem,
    manifest,
    parsed.packageInfo,
    coverPath,
    coverImage,
  );

  ensureCoverMeta(doc, metadata, coverId);
  ensureSingleCoverImageProperty(manifest, coverItem);

  files.set(coverPath, coverImage.bytes);
  files.set(parsed.packageInfo.opfPath, new TextEncoder().encode(serializeXml(doc)));

  const actions: RepairAction[] = [
    {
      type: target ? 'updated' : 'created',
      title: target ? 'Capa substituída' : 'Capa adicionada',
      detail: target
        ? `A nova imagem foi registrada como capa oficial do EPUB no lugar da capa detectada por ${describeTargetSource(target.source)}.`
        : 'A imagem enviada foi adicionada ao pacote e registrada como capa oficial do EPUB.',
      file: coverPath,
    },
    {
      type: 'updated',
      title: 'Metadados de capa atualizados',
      detail: `O OPF agora aponta para o item "${coverId}" como capa principal.`,
      file: parsed.packageInfo.opfPath,
    },
  ];
  const blob = await rebuildEpubZip(files);
  const afterBytes = new Uint8Array(await blob.arrayBuffer());
  const outputFileName = makeRepairedFileName(fileName, '-capa');
  const after = await inspectEpub(outputFileName, afterBytes);
  const warnings = buildCoverReplacementWarnings(before, after);

  return {
    blob,
    fileName: outputFileName,
    before,
    after,
    actions,
    warnings,
    changed: true,
    operation: 'cover-replacement',
  };
}

function buildCoverReplacementWarnings(
  before: Awaited<ReturnType<typeof inspectEpub>>,
  after: Awaited<ReturnType<typeof inspectEpub>>,
): string[] {
  const warnings: string[] = [];

  if (canRepairReport(before)) {
    warnings.push('A capa foi alterada sem executar as demais correções técnicas do EPUB.');
  } else {
    warnings.push('Nenhum reparo foi necessário, somente a capa foi alterada.');
  }

  const optionalAfter = getOptionalOptimizationCount(after);
  if (optionalAfter > 0) {
    warnings.push(
      `A validação final ainda mostra ${formatCount(optionalAfter, 'melhoria opcional', 'melhorias opcionais')} de compatibilidade. Isso não bloqueia o EPUB.`,
    );
  }

  if (after.stats.kindleScore < before.stats.kindleScore) {
    warnings.push(
      'A nova capa foi aplicada, mas a validação final ficou com score menor por uma otimização opcional da imagem enviada.',
    );
  }

  return Array.from(new Set(warnings));
}

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function cloneLoadedFiles(loaded: LoadedEpub): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();

  for (const [path, entry] of loaded.files) {
    files.set(path, entry.bytes);
  }

  return files;
}

function findCoverTarget(
  doc: Document,
  pkg: PackageDocumentInfo,
  files: Map<string, Uint8Array>,
): CoverTarget | undefined {
  const manifest = findFirstByLocalName(doc, 'manifest');
  const items = childElementsByLocalName(manifest, 'item');
  const fromPackage = pkg.coverItem
    ? items.find((item) => getAttr(item, 'id') === pkg.coverItem?.id)
    : undefined;
  const packageTarget = targetFromManifestItem(pkg, files, fromPackage, 'opf-meta');
  if (packageTarget) return packageTarget;

  for (const item of items) {
    if (!/(^|\s)cover-image($|\s)/u.test(getAttr(item, 'properties') ?? '')) continue;
    const target = targetFromManifestItem(pkg, files, item, 'manifest-cover');
    if (target) return target;
  }

  const guideTarget = findGuideCoverTarget(doc, pkg, files, items);
  if (guideTarget) return guideTarget;

  return findFilenameCoverCandidate(pkg, files, items);
}

function targetFromManifestItem(
  pkg: PackageDocumentInfo,
  files: Map<string, Uint8Array>,
  item: Element | undefined,
  source: CoverTarget['source'],
): CoverTarget | undefined {
  const href = getAttr(item, 'href');
  if (!href) return undefined;

  const resolved = resolveFromDir(pkg.opfDir, href);
  const mediaType = getAttr(item, 'media-type') ?? guessMediaType(resolved.path);
  if (!resolved.safe || !files.has(resolved.path) || !isSupportedCoverMediaType(mediaType)) {
    return undefined;
  }

  return {
    path: resolved.path,
    item,
    id: getAttr(item, 'id'),
    source,
  };
}

function findGuideCoverTarget(
  doc: Document,
  pkg: PackageDocumentInfo,
  files: Map<string, Uint8Array>,
  items: Element[],
): CoverTarget | undefined {
  const references = childElementsByLocalName(findFirstByLocalName(doc, 'guide'), 'reference');

  for (const reference of references) {
    if ((getAttr(reference, 'type') ?? '').toLowerCase() !== 'cover') continue;
    const href = getAttr(reference, 'href');
    if (!href) continue;

    const resolved = resolveFromDir(pkg.opfDir, href);
    const mediaType = guessMediaType(resolved.path);
    if (!resolved.safe || !files.has(resolved.path) || !isSupportedCoverMediaType(mediaType))
      continue;

    return {
      path: resolved.path,
      item: findManifestItemByPath(items, pkg, resolved.path),
      id: getAttr(findManifestItemByPath(items, pkg, resolved.path), 'id'),
      source: 'guide',
    };
  }

  return undefined;
}

function findFilenameCoverCandidate(
  pkg: PackageDocumentInfo,
  files: Map<string, Uint8Array>,
  items: Element[],
): CoverTarget | undefined {
  const candidates = Array.from(files.keys())
    .filter((path) => isSupportedCoverMediaType(guessMediaType(path)))
    .filter((path) =>
      /(^|[-_.\s/])(?:cover|capa|frontcover|titlepage|folder)(?:[-_.\s]|$)/iu.test(basename(path)),
    )
    .sort((a, b) => coverCandidateScore(a) - coverCandidateScore(b));
  const path = candidates[0];
  if (!path) return undefined;
  const item = findManifestItemByPath(items, pkg, path);

  return {
    path,
    item,
    id: getAttr(item, 'id'),
    source: 'filename-candidate',
  };
}

function coverCandidateScore(path: string): number {
  const lower = path.toLowerCase();
  if (/(^|\/)cover\.(?:jpe?g|png)$/u.test(lower)) return 0;
  if (/(^|\/)capa\.(?:jpe?g|png)$/u.test(lower)) return 1;
  if (lower.includes('/images/') || lower.includes('/image/')) return 2;
  return 3;
}

function findManifestItemByPath(
  items: Element[],
  pkg: PackageDocumentInfo,
  path: string,
): Element | undefined {
  return items.find((item) => {
    const href = getAttr(item, 'href');
    return Boolean(href && resolveFromDir(pkg.opfDir, href).path === path);
  });
}

function createOrFindManifestItem(
  doc: Document,
  manifest: Element,
  pkg: PackageDocumentInfo,
  coverPath: string,
): Element {
  const existing = findManifestItemByPath(
    childElementsByLocalName(manifest, 'item'),
    pkg,
    coverPath,
  );
  if (existing) return existing;

  const item = doc.createElementNS(OPF_NS, 'item');
  manifest.append(item);
  return item;
}

function ensureManifestCoverItem(
  item: Element,
  manifest: Element,
  pkg: PackageDocumentInfo,
  coverPath: string,
  coverImage: CoverImageInput,
): string {
  const usedIds = new Set(
    childElementsByLocalName(manifest, 'item')
      .map((manifestItem) => getAttr(manifestItem, 'id') ?? '')
      .filter(Boolean),
  );
  const currentId = getAttr(item, 'id');
  const coverId = currentId || makeUniqueId('cover-image', usedIds);

  item.setAttribute('id', coverId);
  item.setAttribute('href', encodePathForXml(relativePath(pkg.opfDir, coverPath)));
  item.setAttribute('media-type', coverImage.mediaType);

  return coverId;
}

function ensureCoverMeta(doc: Document, metadata: Element, coverId: string): void {
  const coverMetas = childElementsByLocalName(metadata, 'meta').filter(
    (meta) => getAttr(meta, 'name') === 'cover',
  );
  const firstCoverMeta = coverMetas[0] ?? doc.createElementNS(OPF_NS, 'meta');

  firstCoverMeta.setAttribute('name', 'cover');
  firstCoverMeta.setAttribute('content', coverId);
  if (!coverMetas[0]) metadata.append(firstCoverMeta);

  for (const extra of coverMetas.slice(1)) extra.remove();
}

function ensureSingleCoverImageProperty(manifest: Element, coverItem: Element): void {
  for (const item of childElementsByLocalName(manifest, 'item')) {
    if (item === coverItem) continue;
    removeTokenAttribute(item, 'properties', 'cover-image');
  }

  addTokenAttribute(coverItem, 'properties', 'cover-image');
}

function addTokenAttribute(element: Element, attribute: string, token: string): void {
  const tokens = new Set((getAttr(element, attribute) ?? '').split(/\s+/u).filter(Boolean));
  tokens.add(token);
  element.setAttribute(attribute, Array.from(tokens).join(' '));
}

function removeTokenAttribute(element: Element, attribute: string, token: string): void {
  const tokens = (getAttr(element, attribute) ?? '')
    .split(/\s+/u)
    .filter((value) => value && value !== token);
  if (tokens.length > 0) {
    element.setAttribute(attribute, tokens.join(' '));
  } else {
    element.removeAttribute(attribute);
  }
}

function makeUniqueCoverPath(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
  mediaType: SupportedCoverMediaType,
): string {
  const extension = mediaType === 'image/jpeg' ? 'jpg' : 'png';
  const baseDir = pkg.opfDir ? `${pkg.opfDir}/Images` : 'Images';
  let candidate = `${baseDir}/cover.${extension}`;
  let index = 2;

  while (files.has(candidate)) {
    candidate = `${baseDir}/cover-${index}.${extension}`;
    index += 1;
  }

  return candidate;
}

function coverPathMatchesMediaType(path: string, mediaType: SupportedCoverMediaType): boolean {
  const lower = path.toLowerCase();
  if (mediaType === 'image/jpeg') return /\.jpe?g$/u.test(lower);
  return lower.endsWith('.png');
}

function isSupportedCoverMediaType(mediaType: string | undefined): boolean {
  return Boolean(mediaType && SUPPORTED_COVER_MEDIA_TYPES.has(mediaType));
}

function describeTargetSource(source: CoverTarget['source']): string {
  if (source === 'manifest-cover') return 'properties="cover-image"';
  if (source === 'opf-meta') return 'meta name="cover"';
  if (source === 'guide') return 'guide type="cover"';
  return 'nome provável de arquivo';
}

function ensureChild(doc: Document, parent: Element, localName: string): Element {
  const existing = childElementsByLocalName(parent, localName)[0];
  if (existing) return existing;
  const created = doc.createElementNS(OPF_NS, localName);
  parent.append(created);
  return created;
}
