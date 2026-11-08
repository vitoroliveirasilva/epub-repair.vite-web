import { KNOWN_MEDIA_TYPES } from './constants';
import { extname } from './pathUtils';

export function guessMediaType(path: string): string | undefined {
  return KNOWN_MEDIA_TYPES[extname(path)];
}

/** Aliases de MIME válidos não devem ser reescritos apenas por heurística da extensão. */
export function areEquivalentMediaTypes(actual: string, expected: string): boolean {
  const a = actual.trim().toLowerCase();
  const e = expected.trim().toLowerCase();
  if (a === e) return true;
  const aliases: Record<string, readonly string[]> = {
    'image/jpeg': ['image/jpg'],
    'font/otf': ['application/vnd.ms-opentype', 'application/font-sfnt', 'application/x-font-otf'],
    'font/ttf': ['application/font-sfnt', 'application/x-font-ttf', 'application/x-font-truetype'],
    'font/woff': ['application/font-woff', 'application/x-font-woff'],
    'font/woff2': ['application/font-woff2', 'application/x-font-woff2'],
  };
  return (aliases[e] ?? []).includes(a);
}

export function isHtmlMediaType(mediaType: string): boolean {
  return (
    mediaType === 'application/xhtml+xml' ||
    mediaType === 'text/html' ||
    mediaType === 'application/x-dtbook+xml'
  );
}
