import type { PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction } from '../model/repairTypes';
import { encodePathForXml, relativePath, resolveReference } from './pathUtils';
import { childElementsByLocalName, parseXml, serializeXmlPreservingDeclaration } from './xmlUtils';

interface MissingSpineEntry {
  path: string;
  position: number;
}

export interface NcxCoverage {
  missing: MissingSpineEntry[];
  safeToComplete: boolean;
}

type ReadResource = (path: string) => Uint8Array | undefined;

const decoder = new TextDecoder('utf-8', { fatal: false });

function substantialReadingText(bytes: Uint8Array | undefined): boolean {
  if (!bytes) return false;
  const text = decoder.decode(bytes.subarray(0, Math.min(bytes.length, 128 * 1024)))
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/giu, ' ')
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&(?:#[xX][0-9a-f]+|#\d+|[a-z][\w.-]*);/giu, ' ')
    .replace(/\s+/gu, ' ').trim();
  return text.length >= 2500;
}

export function inspectNcxCoverage(
  pkg: PackageDocumentInfo,
  read: ReadResource,
): NcxCoverage {
  const empty: NcxCoverage = { missing: [], safeToComplete: false };
  if (pkg.version.startsWith('3') || !pkg.ncxItem?.exists) return empty;
  const source = read(pkg.ncxItem.resolvedPath);
  if (!source) return empty;

  const spine = pkg.spine
    .filter((item) => item.linear !== 'no' && item.manifestItem?.exists &&
      item.manifestItem.mediaType.includes('html'))
    .map((item) => item.manifestItem!.resolvedPath);
  if (spine.length < 2 || spine.length > 2000) return empty;
  const ranks = new Map(spine.map((path, position) => [path, position]));
  let document: Document;
  try {
    document = parseXml(decoder.decode(source));
  } catch {
    return empty;
  }
  if (document.documentElement.localName !== 'ncx') return empty;
  const navMap = childElementsByLocalName(document.documentElement, 'navMap')[0];
  if (!navMap) return empty;
  const points = Array.from(navMap.getElementsByTagName('*'))
    .filter((node) => node.localName === 'navPoint');
  if (!points.length || points.length > 2000) return empty;

  const covered = new Set<string>();
  let safe = pkg.rootfileCount === 1;
  let previous = -1;
  for (const point of points) {
    const sourceLink = childElementsByLocalName(point, 'content')[0]
      ?.getAttribute('src')?.trim() ?? '';
    if (!sourceLink || sourceLink.startsWith('#') ||
        /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(sourceLink)) {
      safe = false;
      continue;
    }
    const resolved = resolveReference(pkg.ncxItem.resolvedPath, sourceLink);
    if (!resolved.safe) {
      safe = false;
      continue;
    }
    covered.add(resolved.path);
    const rank = ranks.get(resolved.path);
    if (rank === undefined) {
      safe = false;
      continue;
    }
    if (rank < previous || sourceLink.includes('#') ||
        childElementsByLocalName(point, 'navPoint').length > 0) safe = false;
    previous = rank;
  }
  const missing = spine
    .map((path, position) => ({ path, position }))
    .filter(({ path }) => !covered.has(path) && substantialReadingText(read(path)));
  if (!missing.length) return empty;

  const direct = childElementsByLocalName(navMap, 'navPoint');
  if (direct.length !== points.length || missing.length > 32) safe = false;
  return { missing, safeToComplete: safe };
}

export function completeSparseNcx(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
): RepairAction[] {
  const coverage = inspectNcxCoverage(pkg, (path) => files.get(path));
  if (!coverage.safeToComplete || !coverage.missing.length || !pkg.ncxItem) return [];
  const path = pkg.ncxItem.resolvedPath;
  const original = files.get(path);
  if (!original) return [];
  const source = decoder.decode(original);
  const doc = parseXml(source);
  const navMap = childElementsByLocalName(doc.documentElement, 'navMap')[0];
  if (!navMap) return [];
  const originalPoints = childElementsByLocalName(navMap, 'navPoint');
  const order = new Map(pkg.spine.map((entry, index) =>
    [entry.manifestItem?.resolvedPath, index]));
  const rank = (point: Element): number => {
    const src = childElementsByLocalName(point, 'content')[0]?.getAttribute('src') ?? '';
    const resolved = resolveReference(path, src);
    return order.get(resolved.path) ?? Number.MAX_SAFE_INTEGER;
  };
  const usedIds = new Set(Array.from(doc.getElementsByTagName('*'))
    .map((item) => item.getAttribute('id')).filter((id): id is string => Boolean(id)));
  const namespace = doc.documentElement.namespaceURI;
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const ordered = [...originalPoints];
  for (const [index, missing] of coverage.missing.entries()) {
    const point = doc.createElementNS(namespace, 'navPoint');
    let identifier = 'epub-repair-text-' + (index + 1);
    while (usedIds.has(identifier)) identifier += '-2';
    usedIds.add(identifier);
    point.setAttribute('id', identifier);
    const label = doc.createElementNS(namespace, 'navLabel');
    const text = doc.createElementNS(namespace, 'text');
    text.textContent = 'Texto principal (parte ' + (index + 1) + ')';
    label.appendChild(text);
    point.appendChild(label);
    const content = doc.createElementNS(namespace, 'content');
    content.setAttribute('src', encodePathForXml(relativePath(dir, missing.path)));
    point.appendChild(content);
    const indexBefore = ordered.findIndex((candidate) => rank(candidate) > missing.position);
    const before = indexBefore < 0 ? null : ordered[indexBefore]!;
    navMap.insertBefore(point, before);
    if (indexBefore < 0) ordered.push(point);
    else ordered.splice(indexBefore, 0, point);
  }
  ordered.forEach((point, index) => point.setAttribute('playOrder', String(index + 1)));
  files.set(path, new TextEncoder().encode(serializeXmlPreservingDeclaration(doc, source)));
  return [{
    type: 'updated',
    title: 'Sumário NCX incompleto complementado',
    detail: coverage.missing.length + ' documento(s) extensos do spine receberam links ' +
      'neutros no índice, sem alterar o texto do livro ou inventar títulos de capítulos.',
    file: path,
  }];
}
