import type { PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction } from '../model/repairTypes';
import { encodePathForXml, relativePath, resolveReference } from './pathUtils';
import { childElementsByLocalName, parseXml, serializeXmlPreservingDeclaration } from './xmlUtils';

type ResourceReader = (path: string) => Uint8Array | undefined;
type Section = {
  path: string;
  index: number;
  id: string;
  ordinal: number;
};
type Candidate = {
  path: string;
  index: number;
  pair: string;
  originalId: string;
  exceptional: boolean;
};
export interface InternalNcxAnalysis {
  sections: Section[];
  missing: Section[];
  safeToRepair: boolean;
  needsMigration: boolean;
}

const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const AUTO_POINT = /^epub-repair-text-\d+$/u;
const GENERATED_CHAPTER_ID = /^epub-repair-chapter-\d+$/u;
const GENERATED_SECTION_ID = /^epub-repair-section-\d+$/u;
const GENERATED_TEXT_ID = /^epub-repair-(?:chapter|section)-text-\d+$/u;
const ASCENSION_ATTRIBUTION = /(?:imperador|emperor).*?(?:ascens[aã]o|ascension).*?(?:trono|throne)/iu;
const DIALOGUE_ATTRIBUTION = /\b(?:disse|perguntou|respondeu|exclamou|murmurou|said|asked|replied|whispered)\b/iu;

function readXml(bytes: Uint8Array): Document {
  return parseXml(decoder.decode(bytes).replace(/&nbsp;/giu, '&#160;'), 'application/xhtml+xml');
}

function paragraphs(doc: Document): Element[] {
  const body = Array.from(doc.getElementsByTagName('*')).find((x) => x.localName === 'body');
  return body ? Array.from(body.getElementsByTagName('*')).filter((x) => x.localName === 'p') : [];
}

function nameOf(element: Element): string {
  return (element.getAttribute('class') ?? '').trim().split(/\s+/u)[0] ?? '';
}

function visible(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

function candidates(path: string, bytes: Uint8Array): Candidate[] {
  let doc: Document;
  try { doc = readXml(bytes); } catch { return []; }
  const ps = paragraphs(doc);
  if (ps.length < 30 || ps.length > 25000) return [];
  const result: Candidate[] = [];
  for (let i = 1; i < ps.length - 3; i += 1) {
    const citation = ps[i]!;
    const attribution = visible(citation);
    const citationClass = nameOf(citation);
    if (!citationClass || !/^[—–-]\s*\S/u.test(attribution) ||
        attribution.length > 200) continue;
    const before = ps[i - 1]!;
    const quoteClass = nameOf(before);
    const quote = visible(before);
    if (!quoteClass || !quote) continue;
    if (quoteClass === citationClass) {
      if (quote.length < 8 || quote.length > 400 || /^[—–-]\s*/u.test(quote) ||
          attribution.length < 30 || !ASCENSION_ATTRIBUTION.test(attribution) ||
          DIALOGUE_ATTRIBUTION.test(attribution)) continue;
      let contentIndex = i + 1;
      while (contentIndex < ps.length && !visible(ps[contentIndex]!)) contentIndex += 1;
      if (contentIndex >= ps.length || visible(ps[contentIndex]!).length < 20) continue;
      result.push({
        path, index: i - 1, pair: '__epub_repair_source_attribution__',
        originalId: before.getAttribute('id') ?? '', exceptional: true,
      });
      continue;
    }
    let start = i - 1;
    while (start > 0 && nameOf(ps[start - 1]!) === quoteClass &&
      Boolean(visible(ps[start - 1]!))) start -= 1;
    if (start === 0 || visible(ps[start - 1]!)) continue;
    let endAttribution = i + 1;
    while (endAttribution < ps.length && nameOf(ps[endAttribution]!) === citationClass &&
      Boolean(visible(ps[endAttribution]!))) endAttribution += 1;
    if (endAttribution >= ps.length || visible(ps[endAttribution]!)) continue;
    let contentIndex = endAttribution;
    while (contentIndex < ps.length && !visible(ps[contentIndex]!)) contentIndex += 1;
    if (contentIndex >= ps.length || nameOf(ps[contentIndex]!) === quoteClass ||
        nameOf(ps[contentIndex]!) === citationClass ||
        visible(ps[contentIndex]!).length < 20) continue;
    result.push({
      path, index: start, pair: quoteClass + '\u0000' + citationClass,
      originalId: ps[start]!.getAttribute('id') ?? '', exceptional: false,
    });
    i = endAttribution - 1;
  }
  return result;
}

function getNcx(pkg: PackageDocumentInfo, read: ResourceReader): Document | undefined {
  const path = pkg.ncxItem?.resolvedPath;
  const bytes = path ? read(path) : undefined;
  if (!bytes) return undefined;
  try {
    const document = parseXml(decoder.decode(bytes));
    return document.documentElement.localName === 'ncx' ? document : undefined;
  } catch { return undefined; }
}

function isOldGenerated(point: Element): boolean {
  const id = point.getAttribute('id') ?? '';
  if (!AUTO_POINT.test(id)) return false;
  const label = childElementsByLocalName(point, 'navLabel')[0];
  const title = childElementsByLocalName(label, 'text')[0]?.textContent?.trim() ?? '';
  return /^Texto principal \(parte \d+\)$/u.test(title) &&
    childElementsByLocalName(point, 'navPoint').length === 0;
}

function isExplicitPart(point: Element): boolean {
  const label = childElementsByLocalName(point, 'navLabel')[0];
  const title = childElementsByLocalName(label, 'text')[0]?.textContent?.trim() ?? '';
  return /^(?:parte|part|livro|book|seção|secao|section)\s+(?:\d+|[IVXLCDM]+)(?:\b|\s|$)/iu.test(title) &&
    !hrefOf(point).includes('#') && childElementsByLocalName(point, 'navPoint').length === 0;
}

function isGeneratedPoint(point: Element): boolean {
  return (point.getAttribute('id') ?? '').startsWith('epub-repair-');
}

function isLegacyInferredGroup(point: Element): boolean {
  return (point.getAttribute('id') ?? '') === 'epub-repair-inferred-chapters';
}

function hrefOf(point: Element): string {
  return childElementsByLocalName(point, 'content')[0]?.getAttribute('src')?.trim() ?? '';
}

function extractTargets(pkg: PackageDocumentInfo, doc: Document): Array<{path: string; fragment: string; title: string}> {
  const ncxPath = pkg.ncxItem?.resolvedPath ?? '';
  const points = Array.from(doc.getElementsByTagName('*'))
    .filter((point) => point.localName === 'navPoint' && !isOldGenerated(point));
  return points.map((point) => {
    const src = hrefOf(point);
    const resolved = resolveReference(ncxPath, src);
    let fragment = src.includes('#') ? src.slice(src.indexOf('#') + 1) : '';
    try { fragment = decodeURIComponent(fragment); } catch { fragment = ''; }
    const label = childElementsByLocalName(point, 'navLabel')[0];
    const title = childElementsByLocalName(label, 'text')[0]?.textContent?.trim() ?? '';
    return { path: resolved.safe ? resolved.path : '', fragment, title };
  });
}

export function inspectInternalNcx(
  pkg: PackageDocumentInfo,
  read: ResourceReader,
): InternalNcxAnalysis {
  const empty: InternalNcxAnalysis = {
    sections: [], missing: [], safeToRepair: false, needsMigration: false,
  };
  if (pkg.version.startsWith('3') || !pkg.ncxItem?.exists ||
      pkg.rootfileCount !== 1) return empty;
  const raw: Candidate[] = [];
  for (const item of pkg.spine) {
    const manifest = item.manifestItem;
    if (item.linear === 'no' || !manifest?.exists ||
        !manifest.mediaType.includes('html')) continue;
    const bytes = read(manifest.resolvedPath);
    if (bytes) raw.push(...candidates(manifest.resolvedPath, bytes));
  }
  const pairs = new Map<string, number>();
  for (const item of raw) pairs.set(item.pair, (pairs.get(item.pair) ?? 0) + 1);
  const regular = raw.filter((item) => !item.exceptional && (pairs.get(item.pair) ?? 0) >= 4);
  const selected = raw.filter((item) =>
    (!item.exceptional && (pairs.get(item.pair) ?? 0) >= 4) ||
    (item.exceptional && regular.length >= 4));
  if (selected.length < 4 || selected.length > 150) return empty;
  const sections = selected.map((item, ordinal): Section => ({
    path: item.path, index: item.index,
    id: item.originalId && !GENERATED_CHAPTER_ID.test(item.originalId)
      ? item.originalId
      : 'epub-repair-chapter-' + String(ordinal + 1).padStart(3, '0'),
    ordinal: ordinal + 1,
  }));
  const doc = getNcx(pkg, read);
  if (!doc) return {
    sections, missing: sections, safeToRepair: false, needsMigration: false,
  };
  const targets = extractTargets(pkg, doc);
  const generatedSections = Array.from(doc.getElementsByTagName('*')).filter((point) =>
    point.localName === 'navPoint' && GENERATED_SECTION_ID.test(point.getAttribute('id') ?? ''));
  const generatedText = Array.from(doc.getElementsByTagName('*')).some((point) =>
    point.localName === 'navPoint' && GENERATED_TEXT_ID.test(point.getAttribute('id') ?? ''));
  const legacyGroup = Array.from(doc.getElementsByTagName('*')).some((point) =>
    point.localName === 'navPoint' && isLegacyInferredGroup(point));
  const generatedMatch = generatedSections.length === sections.length && sections.every((section) =>
    generatedSections.some((point) => {
      const resolved = resolveReference(pkg.ncxItem!.resolvedPath, hrefOf(point));
      const fragment = hrefOf(point).includes('#')
        ? hrefOf(point).slice(hrefOf(point).indexOf('#') + 1)
        : '';
      let decoded: string;
      try { decoded = decodeURIComponent(fragment); } catch { decoded = ''; }
      return resolved.safe && resolved.path === section.path && decoded === section.id &&
        point.getAttribute('id') === 'epub-repair-section-' + section.ordinal;
    }));
  const needsMigration = generatedText || legacyGroup ||
    (generatedSections.length > 0 && !generatedMatch);
  const individuallyMissing = sections.filter((section) =>
    !targets.some((target) => target.path === section.path &&
      (target.fragment === section.id || (!target.fragment && section.index <= 3 &&
        /^(?:cap[ií]tulo|chapter)\s+(?:\d+|[IVXLCDM]+)(?:\b|\s|$)/iu.test(target.title)))));
  const missing = needsMigration ? sections : individuallyMissing;
  const navMap = childElementsByLocalName(doc.documentElement, 'navMap')[0];
  if (!navMap) return { sections, missing, safeToRepair: false, needsMigration };
  const allPoints = Array.from(doc.getElementsByTagName('*'))
    .filter((item) => item.localName === 'navPoint');
  const topLevelPoints = childElementsByLocalName(navMap, 'navPoint');
  const hierarchyIsSafe = allPoints.every((point) =>
    point.parentElement === navMap || isGeneratedPoint(point));
  const spineRanks = new Map(pkg.spine.map((entry, index) =>
    [entry.manifestItem?.resolvedPath, index]));
  const targetsAreSafe = allPoints.every((point) => {
    const src = hrefOf(point);
    if (!src || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/iu.test(src)) return false;
    const resolved = resolveReference(pkg.ncxItem!.resolvedPath, src);
    return resolved.safe && spineRanks.has(resolved.path) &&
      (!src.includes('#') || isGeneratedPoint(point));
  });
  let previousRank = -1;
  const safeToRepair = hierarchyIsSafe && targetsAreSafe && topLevelPoints.every((point) => {
    const src = hrefOf(point);
    if (!src || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/iu.test(src)) return false;
    const resolved = resolveReference(pkg.ncxItem!.resolvedPath, src);
    const rank = spineRanks.get(resolved.path);
    if (!resolved.safe || rank === undefined || rank < previousRank) return false;
    if (src.includes('#') && !isGeneratedPoint(point)) return false;
    previousRank = rank;
    return true;
  }) && allPoints.length <= 250;
  return { sections, missing, safeToRepair, needsMigration };
}

function uniquePointId(doc: Document, suggested: string): string {
  const used = new Set(Array.from(doc.getElementsByTagName('*'))
    .map((el) => el.getAttribute('id')).filter(Boolean));
  let name = suggested;
  let suffix = 2;
  while (used.has(name)) name = suggested + '-' + suffix++;
  return name;
}

function makePoint(doc: Document, id: string, title: string, href: string): Element {
  const namespace = doc.documentElement.namespaceURI;
  const point = doc.createElementNS(namespace, 'navPoint');
  point.setAttribute('id', uniquePointId(doc, id));
  const label = doc.createElementNS(namespace, 'navLabel');
  const text = doc.createElementNS(namespace, 'text');
  text.textContent = title;
  label.appendChild(text);
  point.appendChild(label);
  const content = doc.createElementNS(namespace, 'content');
  content.setAttribute('src', href);
  point.appendChild(content);
  return point;
}

export function recoverInternalNcx(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
): RepairAction[] {
  const coverage = inspectInternalNcx(pkg, (path) => files.get(path));
  if (!coverage.missing.length || !coverage.safeToRepair || !pkg.ncxItem) return [];
  const tocPath = pkg.ncxItem.resolvedPath;
  const sourceBytes = files.get(tocPath);
  if (!sourceBytes) return [];
  const source = decoder.decode(sourceBytes);
  const toc = parseXml(source);
  const navMap = childElementsByLocalName(toc.documentElement, 'navMap')[0];
  if (!navMap) return [];
  if (coverage.needsMigration) {
    Array.from(toc.getElementsByTagName('*'))
      .filter((element) => element.localName === 'navPoint' &&
        (GENERATED_SECTION_ID.test(element.getAttribute('id') ?? '') ||
          isLegacyInferredGroup(element)))
      .forEach((element) => element.remove());
  }
  const nav = { navMap, points: childElementsByLocalName(navMap, 'navPoint') };
  const edited = new Map<string, Document>();
  for (const section of coverage.sections) {
    let doc = edited.get(section.path);
    if (!doc) {
      const bytes = files.get(section.path);
      if (!bytes) return [];
      try { doc = readXml(bytes); } catch { return []; }
      edited.set(section.path, doc);
    }
  }
  if (coverage.needsMigration) {
    for (const doc of edited.values()) {
      Array.from(doc.getElementsByTagName('*')).forEach((element) => {
        const id = element.getAttribute('id') ?? '';
        if (GENERATED_CHAPTER_ID.test(id)) {
          element.removeAttribute('id');
        }
      });
    }
  }
  for (const section of coverage.missing) {
    const doc = edited.get(section.path)!;
    const paragraph = paragraphs(doc)[section.index];
    if (!paragraph) return [];
    if (paragraph.hasAttribute('id') && paragraph.getAttribute('id') !== section.id) return [];
    if (Array.from(doc.getElementsByTagName('*')).some((element) =>
      element !== paragraph && element.getAttribute('id') === section.id)) return [];
    paragraph.setAttribute('id', section.id);
  }

  const original = [...nav.points];
  const ordered = [...original];
  const ranks = new Map(pkg.spine.map((entry, index) =>
    [entry.manifestItem?.resolvedPath, index]));
  const relative = (path: string): string => {
    const dir = tocPath.includes('/') ? tocPath.slice(0, tocPath.lastIndexOf('/')) : '';
    return encodePathForXml(relativePath(dir, path));
  };
  const ordinal = (point: Element): number => {
    const src = hrefOf(point);
    const resolved = resolveReference(tocPath, src);
    return (ranks.get(resolved.path) ?? 999999) * 100000;
  };
  const insert = (point: Element, position: number): void => {
    const next = ordered.findIndex((existing) => ordinal(existing) > position);
    const before = next >= 0 ? ordered[next]! : null;
    nav.navMap.insertBefore(point, before);
    if (next < 0) ordered.push(point);
    else ordered.splice(next, 0, point);
  };

  const firstPath = coverage.sections[0]!.path;
  const hasEntryForFirst = original.some((point) =>
    resolveReference(tocPath, hrefOf(point)).path === firstPath);
  if (!hasEntryForFirst) {
    const originalIntro = edited.get(firstPath) ??
      readXml(files.get(firstPath)!);
    const ps = paragraphs(originalIntro);
    const first = ps.find((node) => Boolean(visible(node)));
    const heading = first ? visible(first) : '';
    const intro = heading.length >= 5 && heading.length <= 100
      ? heading : 'Início do texto';
    insert(makePoint(toc, 'epub-repair-intro', intro, relative(firstPath)),
      (ranks.get(firstPath) ?? 999999) * 100000);
  }

  const existingGroups = new Map<string, Element>();
  for (const candidate of original) {
    if (!isOldGenerated(candidate) && !isExplicitPart(candidate)) continue;
    const resolved = resolveReference(tocPath, hrefOf(candidate));
    if (resolved.safe && !existingGroups.has(resolved.path)) {
      existingGroups.set(resolved.path, candidate);
    }
  }
  for (const section of coverage.missing) {
    let point = Array.from(toc.getElementsByTagName('*')).find((element) =>
      element.localName === 'navPoint' &&
      element.getAttribute('id') === 'epub-repair-section-' + String(section.ordinal));
    if (!point) {
      point = makePoint(toc, 'epub-repair-section-' + String(section.ordinal),
        'Capítulo ' + section.ordinal,
        relative(section.path) + '#' + encodeURIComponent(section.id));
    } else {
      const label = childElementsByLocalName(point, 'navLabel')[0];
      const text = childElementsByLocalName(label, 'text')[0];
      if (text) text.textContent = 'Capítulo ' + section.ordinal;
    }
    const existingGroup = existingGroups.get(section.path);
    if (existingGroup) {
      existingGroup.appendChild(point);
    } else {
      insert(point, (ranks.get(section.path) ?? 999999) * 100000 + section.index);
    }
  }
  const allPoints = Array.from(toc.getElementsByTagName('*'))
    .filter((element) => element.localName === 'navPoint');
  allPoints.forEach((point, index) => point.setAttribute('playOrder', String(index + 1)));
  const head = childElementsByLocalName(toc.documentElement, 'head')[0];
  const depthMeta = childElementsByLocalName(head, 'meta')
    .find((element) => element.getAttribute('name') === 'dtb:depth');
  const depth = Math.max(1, ...allPoints.map((point) => {
    let value = 1;
    for (let parent = point.parentElement; parent; parent = parent.parentElement) {
      if (parent.localName === 'navPoint') value += 1;
    }
    return value;
  }));
  if (depthMeta) depthMeta.setAttribute('content', String(depth));
  for (const [path, doc] of edited) {
    const originalText = decoder.decode(files.get(path));
    files.set(path, encoder.encode(serializeXmlPreservingDeclaration(doc, originalText)));
  }
  files.set(tocPath, encoder.encode(serializeXmlPreservingDeclaration(toc, source)));
  return [{
    type: 'updated',
    title: 'Capítulos internos adicionados ao NCX',
    detail: coverage.sections.length +
      ' divisões com epígrafes recorrentes receberam âncoras internas e links no índice. ' +
      'Cada capítulo aponta diretamente para sua epígrafe, sem subdivisões artificiais para o ' +
      'texto narrativo. Partes editoriais existentes foram preservadas e estruturas geradas por ' +
      'versões anteriores foram migradas. A numeração exige conferência editorial.',
    file: tocPath,
  }];
}

