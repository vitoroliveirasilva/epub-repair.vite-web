import type { ManifestItem, PackageDocumentInfo } from '../model/opfTypes';
import { basename } from './pathUtils';

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

export function findCoverImageCandidate(pkg: PackageDocumentInfo): ManifestItem | undefined {
  const candidates = pkg.manifest
    .filter((item) => item.exists && isCoverCompatibleImage(item.mediaType))
    .map((item) => ({ item, score: coverCandidateScore(item) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.item;
}

export function isCoverCompatibleImage(mediaType: string): boolean {
  return /^(?:image\/jpe?g|image\/png)$/iu.test(mediaType);
}

export function isJpegMediaType(mediaType: string): boolean {
  return /^image\/jpe?g$/iu.test(mediaType);
}

export function isProgressiveJpeg(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;

  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    if (marker === undefined) return false;
    offset += 1;

    if (marker === JPEG_PROGRESSIVE_MARKER) return true;
    if (JPEG_BASELINE_MARKERS.has(marker)) return false;
    if (marker === 0xda || marker === 0xd9) return false;
    if (JPEG_MARKERS_WITHOUT_PAYLOAD.has(marker)) continue;

    if (offset + 1 >= bytes.length) return false;
    const high = bytes[offset];
    const low = bytes[offset + 1];
    if (high === undefined || low === undefined) return false;
    const segmentLength = (high << 8) + low;
    if (segmentLength < 2) return false;
    offset += segmentLength;
  }

  return false;
}

function coverCandidateScore(item: ManifestItem): number {
  const haystack = `${item.id} ${item.href} ${basename(item.resolvedPath)}`.toLowerCase();
  let score = 0;

  if (item.properties.includes('cover-image')) score += 120;
  if (/(^|[-_./])cover([-_./]|$)/iu.test(haystack)) score += 90;
  if (/(^|[-_./])capa([-_./]|$)/iu.test(haystack)) score += 90;
  if (/front[-_]?cover/iu.test(haystack)) score += 70;
  if (/title[-_]?page/iu.test(haystack)) score += 35;
  if (/\.(jpe?g|png)$/iu.test(item.href)) score += 10;

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
