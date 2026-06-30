import { KNOWN_MEDIA_TYPES } from './constants';
import { extname } from './pathUtils';

export function guessMediaType(path: string): string | undefined {
  return KNOWN_MEDIA_TYPES[extname(path)];
}

export function isHtmlMediaType(mediaType: string): boolean {
  return (
    mediaType === 'application/xhtml+xml' ||
    mediaType === 'text/html' ||
    mediaType === 'application/x-dtbook+xml'
  );
}
