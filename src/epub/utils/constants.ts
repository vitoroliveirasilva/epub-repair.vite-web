import type { RepairOptions } from '../model/repairTypes';

export const EPUB_MIME = 'application/epub+zip';
export const MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024;
// Limites conservadores aplicados ANTES da descompactação, inclusive a metadados forjados.
export const MAX_ZIP_ENTRIES = 10_000;
export const MAX_ZIP_ENTRY_BYTES = 128 * 1024 * 1024;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 384 * 1024 * 1024;
export const MAX_ZIP_COMPRESSION_RATIO = 1_000;

export const SYSTEM_FILE_PATTERNS = [
  /^__MACOSX\//i,
  /(^|\/)\.DS_Store$/i,
  /(^|\/)Thumbs\.db$/i,
  /(^|\/)desktop\.ini$/i,
  /(^|\/)\.git\//i,
  /(^|\/)\.svn\//i,
  /(^|\/)\.idea\//i,
  /(^|\/)node_modules\//i,
];

export const HTML_MEDIA_TYPES = new Set([
  'application/xhtml+xml',
  'text/html',
  'application/x-dtbook+xml',
]);

export const CSS_MEDIA_TYPES = new Set(['text/css']);

export const IMAGE_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/svg+xml',
  'image/webp',
  'image/avif',
]);

export const RELEVANT_MEDIA_TYPES = new Set([
  ...HTML_MEDIA_TYPES,
  ...CSS_MEDIA_TYPES,
  ...IMAGE_MEDIA_TYPES,
  'application/x-dtbncx+xml',
  'application/oebps-package+xml',
  'font/otf',
  'font/ttf',
  'font/woff',
  'font/woff2',
  'audio/mpeg',
  'audio/mp4',
  'video/mp4',
  'application/smil+xml',
  'application/xml',
  'text/javascript',
]);

export const KNOWN_MEDIA_TYPES: Record<string, string> = {
  '.xhtml': 'application/xhtml+xml',
  '.html': 'application/xhtml+xml',
  '.htm': 'application/xhtml+xml',
  '.css': 'text/css',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ncx': 'application/x-dtbncx+xml',
  '.opf': 'application/oebps-package+xml',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.smil': 'application/smil+xml',
  '.xml': 'application/xml',
  '.js': 'text/javascript',
};

export const DEFAULT_REPAIR_OPTIONS: RepairOptions = {
  kindleSafeMode: true,
  conservativeMode: false,
  stripSystemFiles: true,
  normalizeMimetype: true,
  rebuildContainer: true,
  repairManifest: true,
  repairSpine: true,
  generateNavigation: true,
  generateNcx: true,
  sanitizeScripts: true,
  removeRemoteResourceLinks: false,
  repairCssReferences: true,
  replaceMissingImagesWithText: false,
  stripImageMetadata: false,
};
