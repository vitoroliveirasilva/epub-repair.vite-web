import type { PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction, RepairOptions } from '../model/repairTypes';
import { isJpegMediaType, isProgressiveJpeg } from '../utils/kindleCompatibility';

const MAX_CANVAS_PIXELS = 50_000_000;

export async function repairImageCompatibility(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
  options: Pick<RepairOptions, 'kindleSafeMode' | 'conservativeMode'>,
): Promise<RepairAction[]> {
  const actions: RepairAction[] = [];
  if (!options.kindleSafeMode || options.conservativeMode) return actions;

  for (const item of pkg.manifest) {
    if (!item.exists || !isJpegMediaType(item.mediaType)) continue;
    const bytes = files.get(item.resolvedPath);
    if (!bytes || !isProgressiveJpeg(bytes)) continue;

    const normalized = await convertProgressiveJpegToBaseline(bytes);
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
  bytes: Uint8Array,
): Promise<Uint8Array | undefined> {
  if (typeof document === 'undefined') return undefined;

  const imageBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(imageBuffer).set(bytes);
  const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
  const image = await loadImage(blob);
  if (!image) return undefined;

  const { width, height } = image;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1)
    return undefined;
  if (width * height > MAX_CANVAS_PIXELS) return undefined;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return undefined;
  context.drawImage(image, 0, 0, width, height);

  const outputBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.92);
  });
  if (!outputBlob) return undefined;

  return new Uint8Array(await outputBlob.arrayBuffer());
}

async function loadImage(blob: Blob): Promise<HTMLImageElement | undefined> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    const loaded = new Promise<HTMLImageElement | undefined>((resolve) => {
      image.onload = () => resolve(image);
      image.onerror = () => resolve(undefined);
    });
    image.src = objectUrl;
    return await loaded;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
