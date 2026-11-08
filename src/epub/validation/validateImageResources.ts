import type { LoadedEpub } from '../model/epubTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import type { Issue } from '../model/issueTypes';
import { createIssue } from '../utils/issueFactory';
import { readJpegDimensions } from '../utils/kindleCompatibility';

type ImageKind = 'jpeg' | 'png' | 'gif' | 'webp';

const declaredType: Record<string, ImageKind> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/** Inspeção conservadora sem executar bytes nem substituir imagens. */
export function validateImageResources(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  const issues: Issue[] = [];
  for (const item of pkg.manifest) {
    const kind = declaredType[item.mediaType.toLowerCase()];
    if (!kind || !item.exists) continue;
    const bytes = loaded.files.get(item.resolvedPath)?.bytes;
    if (!bytes) continue;

    const detected = sniffImageKind(bytes);
    if (detected !== kind) {
      issues.push(createIssue({
        code: 'IMAGE_INVALID_SIGNATURE',
        severity: 'warning',
        title: 'A imagem não corresponde à assinatura do tipo declarado',
        detail: detected
          ? `O OPF declara ${item.mediaType}, mas a assinatura corresponde a ${detected}.`
          : `Não foi reconhecida assinatura ${kind} neste recurso; pode estar incompleto ou corrompido.`,
        file: item.resolvedPath,
        repairable: false,
      }));
      continue;
    }

    const dimensions = basicImageDimensions(kind, bytes);
    // SOI por si só não confirma a integridade: JPEG sem marcador SOF
    // não fornece dimensões verificáveis nem deve parecer íntegro.
    if (kind === 'jpeg' && !dimensions) {
      issues.push(createIssue({
        code: 'IMAGE_MISSING_FRAME',
        severity: 'warning',
        title: 'JPEG sem quadro ou dimensões verificáveis',
        detail: 'O arquivo começa com assinatura JPEG, mas não possui quadro SOF legível. ' +
          'Pode estar truncado e não será reescrito automaticamente.',
        file: item.resolvedPath,
        repairable: false,
      }));
      continue;
    }
    if (dimensions && (dimensions.width < 1 || dimensions.height < 1)) {
      issues.push(createIssue({
        code: 'IMAGE_INVALID_DIMENSIONS',
        severity: 'warning',
        title: 'Dimensões inválidas no cabeçalho da imagem',
        detail: 'A imagem declara altura ou largura igual a zero. Não será alterada automaticamente.',
        file: item.resolvedPath,
        repairable: false,
      }));
    }
  }
  return issues;
}

export function sniffImageKind(bytes: Uint8Array): ImageKind | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((n, i) => bytes[i] === n)) {
    return 'png';
  }
  if (bytes.length >= 6 &&
    (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')) {
    return 'gif';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return 'webp';
  }
  return undefined;
}

function ascii(bytes: Uint8Array, start: number, count: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + count));
}

function basicImageDimensions(
  kind: ImageKind,
  bytes: Uint8Array,
): { width: number; height: number } | undefined {
  if (kind === 'jpeg') return readJpegDimensions(bytes);
  if (kind === 'gif' && bytes.length >= 10) {
    return {
      width: (bytes[6] ?? 0) | ((bytes[7] ?? 0) << 8),
      height: (bytes[8] ?? 0) | ((bytes[9] ?? 0) << 8),
    };
  }
  if (kind === 'png' && bytes.length >= 24 && ascii(bytes, 12, 4) === 'IHDR') {
    const size = (offset: number) =>
      (((bytes[offset] ?? 0) * 0x1000000) +
        ((bytes[offset + 1] ?? 0) << 16) +
        ((bytes[offset + 2] ?? 0) << 8) +
        (bytes[offset + 3] ?? 0)) >>> 0;
    return { width: size(16), height: size(20) };
  }
  return undefined;
}
