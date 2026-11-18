import JSZip from 'jszip';
import { parseZipCentralDirectory } from '../epub/reader/rawZipInspector';
import { decodeZipFileName } from '../epub/reader/zipFileNameEncoding';
import { parsePackageDocument } from '../epub/validation/opfParser';
import { buildCoverReportInfo, findCoverImageCandidate, isCoverCompatibleImage,
  readJpegDimensions } from '../epub/utils/kindleCompatibility';
import { HTML_MEDIA_TYPES } from '../epub/utils/constants';
import { normalizeInternalPath } from '../epub/utils/pathUtils';
import type { EpubEntry, LoadedEpub, ZipEntryInfo } from '../epub/model/epubTypes';
import { el } from './dom';

const MAX_THUMBNAIL_ARCHIVE_BYTES = 80 * 1024 * 1024;
const MAX_THUMBNAIL_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_THUMBNAIL_OPF_BYTES = 1024 * 1024;
const MAX_THUMBNAIL_CONTAINER_BYTES = 128 * 1024;
const MAX_THUMBNAIL_SPINE_BYTES = 256 * 1024;
const coverCache = new WeakMap<File, Promise<string | undefined>>();

type ThumbnailOptions = {
  previewDataUrl?: string | undefined;
  extractIfMissing?: boolean | undefined;
};

export function createEpubFileCoverSymbol(
  file: File, className: string, fallbackText: string,
  options: ThumbnailOptions = {},
): HTMLElement {
  const symbol = el('span', {
    className: className + ' epub-file-cover-symbol',
    attrs: { 'aria-hidden': 'true' },
    children: [el('span', { className: 'epub-file-cover-fallback', text: fallbackText })],
  });

  const attachPreview = (preview: string | undefined): void => {
    if (!preview || !/^data:image\/(?:jpeg|jpg|png);base64,/iu.test(preview)) return;
    const img = el('img', {
      className: 'epub-file-cover-image',
      attrs: { src: preview, alt: '', decoding: 'async' },
    });
    img.addEventListener('load', () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        symbol.classList.add('epub-file-cover-loaded');
      } else {
        img.remove();
      }
    }, { once: true });
    img.addEventListener('error', () => img.remove(), { once: true });
    symbol.append(img);
    if (img.complete && img.naturalWidth > 0) {
      symbol.classList.add('epub-file-cover-loaded');
    }
  };

  if (options.previewDataUrl) {
    attachPreview(options.previewDataUrl);
  } else if (options.extractIfMissing !== false) {
    void getEpubCoverThumbnail(file).then((preview) => {
      if (symbol.isConnected) attachPreview(preview);
    });
  }
  return symbol;
}

export function getEpubCoverThumbnail(file: File): Promise<string | undefined> {
  const existing = coverCache.get(file);
  if (existing) return existing;
  const pending = extractEpubCoverThumbnail(file).catch(() => undefined);
  coverCache.set(file, pending);
  return pending;
}

async function extractEpubCoverThumbnail(file: File): Promise<string | undefined> {
  if (!file.name.toLowerCase().endsWith('.epub') ||
    file.size <= 0 || file.size > MAX_THUMBNAIL_ARCHIVE_BYTES) return undefined;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const raw = parseZipCentralDirectory(bytes);
  if (raw.issues.some((issue) => issue.severity === 'fatal')) return undefined;
  const metadataByPath = new Map<string, ZipEntryInfo>();
  const files = new Map<string, EpubEntry>();

  for (const entry of raw.entries) {
    const normalized = normalizeInternalPath(entry.fileName);
    if (!normalized.safe || entry.unsafeOriginalName || entry.encrypted) continue;
    metadataByPath.set(normalized.path, entry);
    files.set(normalized.path, {
      path: normalized.path, bytes: new Uint8Array(0), directory: entry.isDirectory,
    });
  }

  const zip = await JSZip.loadAsync(bytes, {
    checkCRC32: false,
    decodeFileName: (name) => decodeZipFileName(
      name instanceof Uint8Array ? name : Uint8Array.from(
        name.map((char) => char.charCodeAt(0)),
      ),
    ),
  });

  const readLimited = async (path: string, limit: number): Promise<Uint8Array | undefined> => {
    const normalized = normalizeInternalPath(path);
    if (!normalized.safe) return undefined;
    const entry = metadataByPath.get(normalized.path);
    if (!entry || entry.isDirectory || entry.uncompressedSize <= 0 ||
      entry.uncompressedSize > limit) return undefined;
    const zipEntry = zip.file(normalized.path);
    if (!zipEntry || zipEntry.dir) return undefined;
    const content = await zipEntry.async('uint8array');
    return content.length > 0 && content.length <= limit ? content : undefined;
  };

  const container = await readLimited('META-INF/container.xml', MAX_THUMBNAIL_CONTAINER_BYTES);
  if (container) files.set('META-INF/container.xml', {
    path: 'META-INF/container.xml', bytes: container, directory: false,
  });

  for (const path of [...files.keys()].filter((name) => name.toLowerCase().endsWith('.opf'))
    .slice(0, 8)) {
    const opfBytes = await readLimited(path, MAX_THUMBNAIL_OPF_BYTES);
    if (opfBytes) files.set(path, { path, bytes: opfBytes, directory: false });
  }

  const loaded: LoadedEpub = {
    fileName: file.name, fileSize: bytes.length, bytes: new Uint8Array(0),
    rawEntries: raw.entries, files, fileNames: [...files.keys()], issues: [], validZip: true,
  };
  const pkg = parsePackageDocument(loaded).packageInfo;
  if (!pkg) return undefined;

  let candidate = findCoverImageCandidate(pkg);
  if (!candidate) {
    const firstDocument = pkg.spine.map((entry) => entry.manifestItem)
      .find((item) => item?.exists && HTML_MEDIA_TYPES.has(item.mediaType));
    if (firstDocument?.pathSafe) {
      const contents = await readLimited(firstDocument.resolvedPath, MAX_THUMBNAIL_SPINE_BYTES);
      if (contents) {
        files.set(firstDocument.resolvedPath, {
          path: firstDocument.resolvedPath, bytes: contents, directory: false,
        });
        candidate = findCoverImageCandidate(pkg, files);
      }
    }
  }

  if (!candidate?.exists || !candidate.pathSafe ||
    !isCoverCompatibleImage(candidate.mediaType)) return undefined;

  const imageBytes = await readLimited(candidate.resolvedPath, MAX_THUMBNAIL_IMAGE_BYTES);
  if (!imageBytes || !matchesImageSignature(imageBytes, candidate.mediaType)) return undefined;
  files.set(candidate.resolvedPath, {
    path: candidate.resolvedPath, bytes: imageBytes, directory: false,
  });
  return buildCoverReportInfo(pkg, files).previewDataUrl;
}

function matchesImageSignature(bytes: Uint8Array, mediaType: string): boolean {
  if (/^image\/jpe?g$/iu.test(mediaType)) {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
      Boolean(readJpegDimensions(bytes));
  }
  if (mediaType === 'image/png') {
    return bytes.length > 32 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
      bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
      bytes[6] === 0x1a && bytes[7] === 0x0a &&
      bytes[12] === 0x49 && bytes[13] === 0x48 &&
      bytes[14] === 0x44 && bytes[15] === 0x52;
  }
  return false;
}
