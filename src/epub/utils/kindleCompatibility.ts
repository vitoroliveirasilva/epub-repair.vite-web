import type { EpubEntry } from '../model/epubTypes';
import type { ManifestItem, PackageDocumentInfo } from '../model/opfTypes';
import { HTML_MEDIA_TYPES } from './constants';
import { basename, resolveReference } from './pathUtils';

const INVALID_LANGUAGE_TAGS = new Set([
  '',
  'und',
  'undefined',
  'unknown',
  'none',
  'null',
  'n/a',
  'na',
  'mul',
  'zxx',
]);

const LANGUAGE_TAG_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/iu;
const SAFE_OPF_DATE_PATTERN =
  /^\d{4}(?:-\d{2}(?:-\d{2})?)?(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/u;
const DATE_CAPTURE_PATTERN = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/u;
const JPEG_PROGRESSIVE_MARKER = 0xc2;
const JPEG_BASELINE_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const JPEG_MARKERS_WITHOUT_PAYLOAD = new Set([
  0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9,
]);

export function isInvalidLanguageTag(value: string | undefined): boolean {
  const normalized = value?.trim().replace(/_/gu, '-').toLowerCase() ?? '';
  if (INVALID_LANGUAGE_TAGS.has(normalized)) return true;
  return Boolean(normalized) && !LANGUAGE_TAG_PATTERN.test(normalized);
}

export function normalizeLanguageTag(value: string | undefined, fallback = 'pt-BR'): string {
  const trimmed = value?.trim().replace(/_/gu, '-') ?? '';
  if (isInvalidLanguageTag(trimmed)) return fallback;
  if (!trimmed) return fallback;

  const [base, ...rest] = trimmed.split('-').filter(Boolean);
  if (!base) return fallback;

  const normalizedParts = [base.toLowerCase()];
  for (const part of rest) {
    normalizedParts.push(part.length === 2 ? part.toUpperCase() : part.toLowerCase());
  }
  return normalizedParts.join('-');
}

export function isInvalidOpfDate(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return false;
  if (!SAFE_OPF_DATE_PATTERN.test(trimmed)) return true;

  const normalized = normalizeOpfDate(trimmed);
  return Boolean(normalized && trimmed.length >= 10 && normalized !== trimmed.slice(0, 10));
}

export function normalizeOpfDate(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return undefined;

  const match = DATE_CAPTURE_PATTERN.exec(trimmed);
  if (!match) return undefined;

  const [, yearRaw, monthRaw, dayRaw] = match;
  if (!yearRaw || !monthRaw || !dayRaw) return undefined;

  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  if (!isValidDateParts(year, month, day)) return undefined;

  return [year.toString().padStart(4, '0'), pad2(month), pad2(day)].join('-');
}

export function findCoverImageCandidate(
  pkg: PackageDocumentInfo,
  entries?: ReadonlyMap<string, Pick<EpubEntry, 'bytes'>>,
): ManifestItem | undefined {
  const namedCandidates = pkg.manifest
    .filter((item) => item.exists && isCoverCompatibleImage(item.mediaType))
    .map((item) => ({ item, score: coverCandidateScore(item) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  return namedCandidates[0]?.item ?? findFirstSpineImageCandidate(pkg, entries);
}

export function isCoverCompatibleImage(mediaType: string): boolean {
  return /^(?:image\/jpe?g|image\/png)$/iu.test(mediaType);
}

export function isJpegMediaType(mediaType: string): boolean {
  return /^image\/jpe?g$/iu.test(mediaType);
}

export function isProgressiveJpeg(bytes: Uint8Array): boolean {
  return findJpegStartOfFrame(bytes)?.marker === JPEG_PROGRESSIVE_MARKER;
}

function findFirstSpineImageCandidate(
  pkg: PackageDocumentInfo,
  entries: ReadonlyMap<string, Pick<EpubEntry, 'bytes'>> | undefined,
): ManifestItem | undefined {
  if (!entries) return undefined;

  const manifestByPath = new Map(pkg.manifest.map((item) => [item.resolvedPath, item]));
  const firstReadableDocument = pkg.spine
    .map((item) => item.manifestItem)
    .find((item) => Boolean(item?.exists && HTML_MEDIA_TYPES.has(item.mediaType)));
  if (!firstReadableDocument) return undefined;

  const entry = entries.get(firstReadableDocument.resolvedPath);
  if (!entry) return undefined;

  const text = new TextDecoder('utf-8', { fatal: false }).decode(entry.bytes);
  const imageSources = extractImageSources(text).slice(0, 4);

  for (const source of imageSources) {
    const resolved = resolveReference(firstReadableDocument.resolvedPath, source);
    if (!resolved.safe) continue;

    const item = manifestByPath.get(resolved.path);
    if (!item || !item.exists || !isCoverCompatibleImage(item.mediaType)) continue;

    const imageEntry = entries.get(item.resolvedPath);
    const dimensions = imageEntry
      ? readImageDimensions(imageEntry.bytes, item.mediaType)
      : undefined;
    if (!dimensions || looksLikeCoverDimensions(dimensions.width, dimensions.height)) return item;
  }

  return undefined;
}

function extractImageSources(text: string): string[] {
  const sources: string[] = [];
  const imagePattern = /<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/giu;
  for (const match of text.matchAll(imagePattern)) {
    const source = match[2]?.trim();
    if (source) sources.push(source);
    if (sources.length >= 4) break;
  }
  return sources;
}

function readImageDimensions(
  bytes: Uint8Array,
  mediaType: string,
): { width: number; height: number } | undefined {
  if (/^image\/png$/iu.test(mediaType)) return readPngDimensions(bytes);
  if (isJpegMediaType(mediaType)) return readJpegDimensions(bytes);
  return undefined;
}

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !pngSignature.every((value, index) => bytes[index] === value)) {
    return undefined;
  }

  return {
    width: readUint32(bytes, 16),
    height: readUint32(bytes, 20),
  };
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  const frame = findJpegStartOfFrame(bytes);
  return frame ? { width: frame.width, height: frame.height } : undefined;
}

function looksLikeCoverDimensions(width: number, height: number): boolean {
  if (width < 180 || height < 240) return false;
  const ratio = height / width;
  return ratio >= 1.1 && ratio <= 2.3;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  const b0 = bytes[offset];
  const b1 = bytes[offset + 1];
  const b2 = bytes[offset + 2];
  const b3 = bytes[offset + 3];
  if (b0 === undefined || b1 === undefined || b2 === undefined || b3 === undefined) return 0;
  return b0 * 0x1000000 + ((b1 << 16) | (b2 << 8) | b3);
}

function findJpegStartOfFrame(
  bytes: Uint8Array,
): { marker: number; width: number; height: number } | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;

  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    if (marker === undefined) return undefined;
    offset += 1;

    if (marker === 0xda || marker === 0xd9) return undefined;
    if (JPEG_MARKERS_WITHOUT_PAYLOAD.has(marker)) continue;

    if (offset + 1 >= bytes.length) return undefined;
    const high = bytes[offset];
    const low = bytes[offset + 1];
    if (high === undefined || low === undefined) return undefined;
    const segmentLength = (high << 8) + low;
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return undefined;

    if (JPEG_BASELINE_MARKERS.has(marker)) {
      const heightHigh = bytes[offset + 3];
      const heightLow = bytes[offset + 4];
      const widthHigh = bytes[offset + 5];
      const widthLow = bytes[offset + 6];
      if (
        heightHigh === undefined ||
        heightLow === undefined ||
        widthHigh === undefined ||
        widthLow === undefined
      ) {
        return undefined;
      }
      return {
        marker,
        width: (widthHigh << 8) + widthLow,
        height: (heightHigh << 8) + heightLow,
      };
    }

    offset += segmentLength;
  }

  return undefined;
}

export function coverCandidateScore(item: ManifestItem): number {
  const haystack = `${item.id} ${item.href} ${basename(item.resolvedPath)}`.toLowerCase();
  let score = 0;

  if (item.properties.includes('cover-image')) score += 120;
  if (/(^|[-_./])cover([-_./]|$)/iu.test(haystack)) score += 90;
  if (/(^|[-_./])capa([-_./]|$)/iu.test(haystack)) score += 90;
  if (/front[-_]?cover/iu.test(haystack)) score += 70;
  if (/title[-_]?page/iu.test(haystack)) score += 35;

  return score;
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}
