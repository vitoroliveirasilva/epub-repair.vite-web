export type SupportedCoverMediaType = 'image/jpeg' | 'image/png';

export interface CoverImageInput {
  fileName: string;
  bytes: Uint8Array;
  mediaType: SupportedCoverMediaType;
  previewDataUrl: string;
  normalized?: boolean | undefined;
  normalizationNote?: string | undefined;
}

export const MAX_COVER_IMAGE_SIZE_BYTES = 15 * 1024 * 1024;

const JPEG_REENCODE_QUALITY = 0.92;

export async function readCoverImageFile(file: File): Promise<CoverImageInput> {
  if (file.size <= 0) {
    throw new Error('A imagem da capa está vazia, selecione um JPG ou PNG válido.');
  }

  if (file.size > MAX_COVER_IMAGE_SIZE_BYTES) {
    throw new Error(
      `Imagem muito grande, o limite é ${Math.round(MAX_COVER_IMAGE_SIZE_BYTES / 1024 / 1024)} MB.`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaType = detectSupportedCoverMediaType(file, bytes);

  if (!mediaType) {
    throw new Error('Formato de capa não suportado, use uma imagem JPG, JPEG ou PNG.');
  }

  const normalizedBytes =
    mediaType === 'image/jpeg' ? await normalizeJpegForEpub(bytes) : undefined;
  const finalBytes =
    normalizedBytes && normalizedBytes.length <= MAX_COVER_IMAGE_SIZE_BYTES
      ? normalizedBytes
      : bytes;
  const normalized = finalBytes !== bytes;

  return {
    fileName: sanitizeCoverFileName(file.name, mediaType),
    bytes: finalBytes,
    mediaType,
    previewDataUrl: `data:${mediaType};base64,${uint8ArrayToBase64(finalBytes)}`,
    normalized,
    normalizationNote: normalized
      ? 'JPEG normalizado para aumentar compatibilidade com leitores antigos.'
      : undefined,
  };
}

function detectSupportedCoverMediaType(
  file: File,
  bytes: Uint8Array,
): SupportedCoverMediaType | undefined {
  if (hasJpegSignature(bytes)) return 'image/jpeg';
  if (hasPngSignature(bytes)) return 'image/png';

  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (type === 'image/jpeg' || /\.jpe?g$/u.test(name)) return 'image/jpeg';
  if (type === 'image/png' || name.endsWith('.png')) return 'image/png';

  return undefined;
}

function hasJpegSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

async function normalizeJpegForEpub(bytes: Uint8Array): Promise<Uint8Array | undefined> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return undefined;

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }));
    if (bitmap.width <= 0 || bitmap.height <= 0) return undefined;

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return undefined;

    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | undefined>((resolve) => {
      canvas.toBlob((value) => resolve(value ?? undefined), 'image/jpeg', JPEG_REENCODE_QUALITY);
    });

    if (!blob || blob.size <= 0) return undefined;
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return undefined;
  } finally {
    bitmap?.close();
  }
}

function sanitizeCoverFileName(fileName: string, mediaType: SupportedCoverMediaType): string {
  const extension = mediaType === 'image/jpeg' ? '.jpg' : '.png';
  const base = fileName
    .replace(/\.[^.]+$/u, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);

  return `${base || 'capa'}${extension}`;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}
