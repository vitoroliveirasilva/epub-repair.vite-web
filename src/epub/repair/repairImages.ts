import type { PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction, RepairOptions } from '../model/repairTypes';
import { isJpegMediaType, isProgressiveJpeg, readJpegDimensions } from '../utils/kindleCompatibility';

const MAX_CANVAS_PIXELS = 50_000_000;
const IMAGE_DECODE_TIMEOUT_MS = 2_500;

export async function repairImageCompatibility(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
  options: Pick<RepairOptions, 'kindleSafeMode' | 'conservativeMode'>,
  signal?: AbortSignal,
): Promise<RepairAction[]> {
  const actions: RepairAction[] = [];
  if (!options.kindleSafeMode || options.conservativeMode) return actions;

  for (const item of pkg.manifest) {
    if (signal?.aborted) throw new DOMException('Conversão de imagem cancelada.', 'AbortError');
    if (!item.exists || !isJpegMediaType(item.mediaType)) continue;
    const bytes = files.get(item.resolvedPath);
    if (!bytes || !isProgressiveJpeg(bytes)) continue;

    const normalized = await convertProgressiveJpegToBaseline(bytes, signal);
    if (signal?.aborted) throw new DOMException('Conversão de imagem cancelada.', 'AbortError');
    if (!normalized) {
      actions.push({
        type: 'skipped',
        title: 'JPEG progressivo não convertido',
        detail:
          'A imagem foi detectada como JPEG progressivo, mas o navegador não conseguiu reprocessá-la com segurança.',
        file: item.resolvedPath,
      });
      continue;
    }

    files.set(item.resolvedPath, normalized);
    actions.push({
      type: 'normalized',
      title: 'JPEG progressivo convertido',
      detail: 'A imagem foi regravada como JPEG compatível via canvas do navegador.',
      file: item.resolvedPath,
    });
  }

  return actions;
}

async function convertProgressiveJpegToBaseline(
  bytes: Uint8Array, signal?: AbortSignal,
): Promise<Uint8Array | undefined> {
  if (typeof document === 'undefined') return undefined;

  
  const dimensions = readJpegDimensions(bytes);
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1 ||
      dimensions.width * dimensions.height > MAX_CANVAS_PIXELS) return undefined;

  const imageBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(imageBuffer).set(bytes);
  const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
  const image = await loadImage(blob, signal);
  if (!image) return undefined;

  const { width, height } = image;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1)
    return undefined;
  if (width * height > MAX_CANVAS_PIXELS) return undefined;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  try {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return undefined;
    context.drawImage(image, 0, 0, width, height);
  } catch {
    return undefined;
  }

  const outputBlob = await new Promise<Blob | null>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Conversão de imagem cancelada.', 'AbortError'));
      return;
    }
    let finished = false;
    const timeout = window.setTimeout(() => done(null), IMAGE_DECODE_TIMEOUT_MS);
    function done(result: Blob | null): void {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      resolve(result);
    }
    function abort(): void {
      if (finished) return;
      finished = true;
      if (timeout !== undefined) clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      reject(new DOMException('Conversão de imagem cancelada.', 'AbortError'));
    }
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      canvas.toBlob(done, 'image/jpeg', 0.92);
    } catch {
      done(null);
    }
  });
  if (!outputBlob || outputBlob.size === 0) return undefined;
  const output = new Uint8Array(await outputBlob.arrayBuffer());
  
  
  if (output.length < 4 || output[0] !== 0xff || output[1] !== 0xd8 ||
      isProgressiveJpeg(output)) return undefined;
  const decodedOutput = await loadImage(outputBlob, signal);
  if (!decodedOutput || decodedOutput.width !== width || decodedOutput.height !== height) {
    return undefined;
  }
  const before = sampledCanvasPixels(image, width, height);
  const after = sampledCanvasPixels(decodedOutput, width, height);
  if (!before || !after || !isJpegSampleVisuallyComparable(before, after)) return undefined;

  return output;
}

async function loadImage(
  blob: Blob, signal?: AbortSignal,
): Promise<HTMLImageElement | undefined> {
  if (typeof URL.createObjectURL !== 'function') return undefined;
  let objectUrl: string;
  try {
    objectUrl = URL.createObjectURL(blob);
  } catch {
    return undefined;
  }
  try {
    const image = new Image();
    image.decoding = 'async';
    return await new Promise<HTMLImageElement | undefined>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Conversão de imagem cancelada.', 'AbortError'));
        return;
      }
      let finished = false;
      const timeout = window.setTimeout(() => done(), IMAGE_DECODE_TIMEOUT_MS);
      function done(result?: HTMLImageElement): void {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
        signal?.removeEventListener('abort', abort);
        resolve(result);
      }
      function abort(): void {
        if (finished) return;
        finished = true;
        if (timeout !== undefined) clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
        signal?.removeEventListener('abort', abort);
        reject(new DOMException('Conversão de imagem cancelada.', 'AbortError'));
      }
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      image.onload = () => done(image);
      image.onerror = () => done();
      try {
        image.src = objectUrl;
      } catch {
        done();
      }
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}



export function sampledCanvasPixels(
  image: CanvasImageSource, width: number, height: number,
): Uint8ClampedArray | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(96, width);
  canvas.height = Math.min(96, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return undefined;
  try {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return undefined;
  }
}

export function isJpegSampleVisuallyComparable(
  before: Uint8ClampedArray, after: Uint8ClampedArray,
): boolean {
  if (before.length === 0 || before.length !== after.length ||
      before.length % 4 !== 0) return false;
  let error = 0;
  for (let index = 0; index < before.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      error += Math.abs((before[index + channel] ?? 0) - (after[index + channel] ?? 0));
    }
  }
  
  return error / (before.length / 4 * 3) <= 22;
}
