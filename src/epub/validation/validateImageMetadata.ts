import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { createIssue } from '../utils/issueFactory';

const JPEG_SOI = [0xff, 0xd8] as const;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const MAX_IMAGE_SEGMENTS = 4096;

function startsWith(bytes: Uint8Array, offset: number, prefix: string): boolean {
  if (offset < 0 || offset + prefix.length > bytes.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (bytes[offset + i] !== prefix.charCodeAt(i)) return false;
  }
  return true;
}

function sniffJpegMetadata(bytes: Uint8Array, found: Set<string>): void {
  if (bytes[0] !== JPEG_SOI[0] || bytes[1] !== JPEG_SOI[1]) return;
  let cursor = 2;
  for (let count = 0; count < MAX_IMAGE_SEGMENTS && cursor + 4 <= bytes.length; count += 1) {
    if (bytes[cursor] !== 0xff) break;
    while (bytes[cursor] === 0xff) cursor += 1;
    const marker = bytes[cursor++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 2 > bytes.length) break;
    const length = ((bytes[cursor] ?? 0) << 8) | (bytes[cursor + 1] ?? 0);
    if (length < 2 || cursor + length > bytes.length) break;
    const dataOffset = cursor + 2;
    if (marker === 0xe1) {
      if (startsWith(bytes, dataOffset, 'Exif\0\0')) found.add('EXIF');
      if (startsWith(bytes, dataOffset, 'http://ns.adobe.com/xap/1.0/\0') ||
          startsWith(bytes, dataOffset, 'http://ns.adobe.com/xmp/extension/\0')) {
        found.add('XMP');
      }
    }
    if (marker === 0xed && startsWith(bytes, dataOffset, 'Photoshop 3.0\0')) {
      found.add('Photoshop');
    }
    cursor += length;
  }
}

function sniffPngMetadata(bytes: Uint8Array, found: Set<string>): void {
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = 8;
  for (let count = 0; count < MAX_IMAGE_SEGMENTS && cursor + 12 <= bytes.length; count += 1) {
    const length = view.getUint32(cursor, false);
    const dataStart = cursor + 8;
    const end = dataStart + length + 4; // Inclui CRC; não regravar nada.
    if (end > bytes.length || end < dataStart) break;
    if (startsWith(bytes, cursor + 4, 'eXIf')) found.add('EXIF');
    if (startsWith(bytes, cursor + 4, 'iTXt') ||
        startsWith(bytes, cursor + 4, 'tEXt') ||
        startsWith(bytes, cursor + 4, 'zTXt')) {
      if (startsWith(bytes, dataStart, 'XML:com.adobe.xmp\0')) found.add('XMP');
      if (startsWith(bytes, dataStart, 'Raw profile type exif\0')) found.add('EXIF');
      if (startsWith(bytes, dataStart, 'Photoshop\0')) found.add('Photoshop');
    }
    if (startsWith(bytes, cursor + 4, 'IEND')) break;
    cursor = end;
  }
}

function sniffWebpMetadata(bytes: Uint8Array, found: Set<string>): void {
  if (!startsWith(bytes, 0, 'RIFF') || !startsWith(bytes, 8, 'WEBP')) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = 12;
  for (let count = 0; count < MAX_IMAGE_SEGMENTS && cursor + 8 <= bytes.length; count += 1) {
    const length = view.getUint32(cursor + 4, true);
    const end = cursor + 8 + length + (length & 1);
    if (end > bytes.length || end < cursor) break;
    if (startsWith(bytes, cursor, 'EXIF')) found.add('EXIF');
    if (startsWith(bytes, cursor, 'XMP ')) found.add('XMP');
    cursor = end;
  }
}

/**
 * Somente inventário: metadados podem incluir autoria, orientação, cores e
 * geolocalização. Remoção silenciosa alteraria a obra, portanto é proibida.
 */
export function validateImageMetadata(
  loaded: LoadedEpub,
  pkg: PackageDocumentInfo,
): Issue[] {
  const issues: Issue[] = [];
  for (const item of pkg.manifest) {
    if (!item.exists || !['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(item.mediaType)) continue;
    const bytes = loaded.files.get(item.resolvedPath)?.bytes;
    if (!bytes) continue;
    const found = new Set<string>();
    if (item.mediaType === 'image/jpeg' || item.mediaType === 'image/jpg') sniffJpegMetadata(bytes, found);
    if (item.mediaType === 'image/png') sniffPngMetadata(bytes, found);
    if (item.mediaType === 'image/webp') sniffWebpMetadata(bytes, found);
    if (found.size === 0) continue;
    issues.push(createIssue({
      code: 'IMAGE_EMBEDDED_METADATA',
      severity: 'info',
      title: 'Metadados editoriais presentes na imagem',
      detail: [...found].join(', ') + ' detectado(s) na imagem. Podem preservar autoria, ' +
        'orientação ou informações pessoais. Nenhum bloco será apagado automaticamente.',
      file: item.resolvedPath,
      context: [...found].join(', '),
      repairable: false,
    }));
  }
  return issues;
}
