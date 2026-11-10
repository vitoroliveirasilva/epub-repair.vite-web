import type { PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction } from '../model/repairTypes';







export type MetadataImageType = 'image/jpeg' | 'image/png' | 'image/webp';
export interface MetadataStripResult {
  bytes: Uint8Array;
  removed: string[];
  skipped?: string | undefined;
}
const LIMIT = 4096;
const ascii = (bytes: Uint8Array, at: number, value: string): boolean =>
  at >= 0 && at + value.length <= bytes.length &&
  [...value].every((char, i) => bytes[at + i] === char.charCodeAt(0));

function safeTiffOrientation(bytes: Uint8Array, at: number, limit: number): boolean {
  
  
  if (at + 8 > limit) return false;
  const little = ascii(bytes, at, 'II');
  if (!little && !ascii(bytes, at, 'MM')) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(at + 2, little) !== 42) return false;
  const ifd = at + view.getUint32(at + 4, little);
  if (ifd < at + 8 || ifd + 2 > limit) return false;
  const count = view.getUint16(ifd, little);
  if (count > 256 || ifd + 2 + count * 12 + 4 > limit) return false;
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (view.getUint16(entry, little) !== 0x0112) continue;
    
    if (view.getUint16(entry + 2, little) !== 3 ||
        view.getUint32(entry + 4, little) !== 1) return false;
    return view.getUint16(entry + 8, little) === 1;
  }
  return true;
}

function result(original: Uint8Array, chunks: Uint8Array[], removed: string[],
  skipped?: string): MetadataStripResult {
  if (removed.length === 0) return { bytes: original, removed, ...(skipped ? { skipped } : {}) };
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return { bytes: out, removed, ...(skipped ? { skipped } : {}) };
}

function jpeg(original: Uint8Array): MetadataStripResult {
  if (original.length < 4 || original[0] !== 0xff || original[1] !== 0xd8)
    return { bytes: original, removed: [], skipped: 'Assinatura JPEG inválida' };
  const chunks = [original.subarray(0, 2)];
  const removed: string[] = [];
  let skipped = '';
  let at = 2;
  for (let n = 0; n < LIMIT && at < original.length; n++) {
    const begin = at;
    if (original[at++] !== 0xff) break;
    while (original[at] === 0xff) at += 1;
    const marker = original[at++];
    if (marker === undefined) break;
    if (marker === 0xd9 || marker === 0xda) {
      chunks.push(original.subarray(begin));
      return result(original, chunks, removed, skipped);
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(original.subarray(begin, at));
      continue;
    }
    if (at + 2 > original.length) break;
    const size = (original[at]! << 8) | original[at + 1]!;
    if (size < 2 || at + size > original.length) break;
    const end = at + size;
    const start = at + 2;
    let type = '';
    if (marker === 0xe1 && ascii(original, start, 'Exif\0\0')) {
      if (safeTiffOrientation(original, start + 6, end)) type = 'EXIF';
      else skipped = 'EXIF retido: orientação ausente/ilegível ou diferente de 1';
    } else if (marker === 0xe1 &&
      (ascii(original, start, 'http://ns.adobe.com/xap/1.0/\0') ||
       ascii(original, start, 'http://ns.adobe.com/xmp/extension/\0'))) type = 'XMP';
    else if (marker === 0xed && ascii(original, start, 'Photoshop 3.0\0'))
      type = 'Photoshop';
    if (type) removed.push(type);
    else chunks.push(original.subarray(begin, end));
    at = end;
  }
  
  
  return { bytes: original, removed: [], skipped: 'JPEG truncado ou estrutura ambígua' };
}

function png(original: Uint8Array): MetadataStripResult {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((byte, i) => original[i] === byte))
    return { bytes: original, removed: [], skipped: 'Assinatura PNG inválida' };
  const view = new DataView(original.buffer, original.byteOffset, original.byteLength);
  const parts = [original.subarray(0, 8)];
  const removed: string[] = [];
  let skipped = '';
  let at = 8;
  let complete = false;
  let hasImage = false;
  for (let n = 0; n < LIMIT && at + 12 <= original.length; n++) {
    const size = view.getUint32(at, false);
    const end = at + 12 + size;
    if (!Number.isSafeInteger(end) || end > original.length) break;
    const name = String.fromCharCode(...original.subarray(at + 4, at + 8));
    const data = at + 8;
    let type = '';
    if (name === 'IDAT') hasImage = true;
    if (name === 'eXIf') {
      if (safeTiffOrientation(original, data, data + size)) type = 'EXIF';
      else skipped = 'EXIF PNG retido: orientação ambígua';
    } else if (name === 'iTXt' || name === 'tEXt' || name === 'zTXt') {
      if (ascii(original, data, 'XML:com.adobe.xmp\0')) type = 'XMP';
      if (ascii(original, data, 'Raw profile type exif\0'))
        skipped = 'EXIF textual PNG preservado por orientação não comprovada';
      if (ascii(original, data, 'Photoshop\0')) type = 'Photoshop';
    }
    if (type) removed.push(type);
    else parts.push(original.subarray(at, end));
    at = end;
    if (name === 'IEND') { complete = true; break; }
  }
  if (!complete || !hasImage || at !== original.length) {
    return { bytes: original, removed: [], skipped: 'PNG truncado ou sem IDAT/IEND íntegros' };
  }
  return result(original, parts, removed, skipped);
}

function webp(original: Uint8Array): MetadataStripResult {
  if (!ascii(original, 0, 'RIFF') || !ascii(original, 8, 'WEBP') ||
      original.length < 30)
    return { bytes: original, removed: [], skipped: 'Assinatura WebP inválida' };
  const view = new DataView(original.buffer, original.byteOffset, original.byteLength);
  if (view.getUint32(4, true) !== original.length - 8)
    return { bytes: original, removed: [], skipped: 'RIFF com tamanho inconsistente' };
  const chunks: Uint8Array[] = [original.subarray(0, 12)];
  const removed: string[] = [];
  let at = 12;
  let vp8xOffset = -1;
  for (let n = 0; n < LIMIT && at < original.length; n++) {
    if (at + 8 > original.length) break;
    const name = String.fromCharCode(...original.subarray(at, at + 4));
    const size = view.getUint32(at + 4, true);
    const end = at + 8 + size + (size & 1);
    if (end > original.length || !Number.isSafeInteger(end)) break;
    if (name === 'VP8X') vp8xOffset = at;
    if (name === 'EXIF') {
      
      
      if (safeTiffOrientation(original, at + 8, at + 8 + size)) {
        removed.push('EXIF');
      } else chunks.push(original.subarray(at, end));
    } else if (name === 'XMP ') removed.push('XMP');
    else chunks.push(original.subarray(at, end));
    at = end;
  }
  if (at !== original.length || (removed.length && vp8xOffset < 0) ||
      (vp8xOffset >= 0 && view.getUint32(vp8xOffset + 4, true) < 10)) {
    return { bytes: original, removed: [], skipped: 'WebP sem VP8X válido ou RIFF truncado' };
  }
  if (removed.length === 0) return { bytes: original, removed };
  const combined = result(original, chunks, removed);
  const out = combined.bytes;
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  
  
  
  const pos = chunks.slice(0, chunks.findIndex((p) =>
    p.length >= 4 && ascii(p, 0, 'VP8X'))).reduce((n, p) => n + p.length, 0);
  if (removed.includes('EXIF')) out[pos + 8] = out[pos + 8]! & ~0x08;
  if (removed.includes('XMP')) out[pos + 8] = out[pos + 8]! & ~0x04;
  return { bytes: out, removed };
}

export function stripImageMetadata(
  bytes: Uint8Array, mime: string,
): MetadataStripResult {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return jpeg(bytes);
  if (mime === 'image/png') return png(bytes);
  if (mime === 'image/webp') return webp(bytes);
  return { bytes, removed: [], skipped: 'Formato sem limpeza metadata implementada' };
}

 
export function stripEpubImageMetadata(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
  candidates: ReadonlySet<string>,
): RepairAction[] {
  const actions: RepairAction[] = [];
  const seen = new Set<string>();
  for (const item of pkg.manifest) {
    const path = item.resolvedPath;
    if (!item.exists || !candidates.has(path) || seen.has(path)) continue;
    seen.add(path);
    const bytes = files.get(path);
    if (!bytes) continue;
    const changed = stripImageMetadata(bytes, item.mediaType);
    if (changed.removed.length && changed.bytes !== bytes) {
      files.set(path, changed.bytes);
      actions.push({
        type: 'normalized',
        title: 'Metadados de imagem removidos com consentimento',
        detail: 'Removidos ' + [...new Set(changed.removed)].join(', ') +
          ' sem recomprimir pixels. Perfil ICC preservado e original intacto.',
        file: path,
      });
    }
    if (changed.skipped) {
      actions.push({
        type: 'skipped',
        title: 'Metadados preservados por segurança',
        detail: changed.skipped,
        file: path,
      });
    }
  }
  return actions;
}
