import JSZip from 'jszip';
import type { EpubEntry, LoadedEpub } from '../model/epubTypes';
import { createIssue } from '../utils/issueFactory';
import { normalizeInternalPath } from '../utils/pathUtils';
import { parseZipCentralDirectory } from './rawZipInspector';

export async function loadEpub(fileName: string, bytes: Uint8Array): Promise<LoadedEpub> {
  const raw = parseZipCentralDirectory(bytes);
  let zip: JSZip;

  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: false });
  } catch (error) {
    return {
      fileName,
      fileSize: bytes.length,
      bytes,
      rawEntries: raw.entries,
      files: new Map(),
      fileNames: [],
      issues: [
        ...raw.issues,
        createIssue({
          code: 'ZIP_INVALID',
          severity: 'fatal',
          title: 'Não foi possível abrir o EPUB',
          detail: error instanceof Error ? error.message : 'O ZIP não pôde ser lido.',
          repairable: false,
        }),
      ],
      validZip: false,
    };
  }

  const files = new Map<string, EpubEntry>();
  const fileNames: string[] = [];
  const issues = [...raw.issues];

  for (const [originalName, zipEntry] of Object.entries(zip.files)) {
    const normalized = normalizeInternalPath(originalName);
    if (!normalized.path) continue;
    fileNames.push(normalized.path);

    if (!normalized.safe) {
      issues.push(
        createIssue({
          code: 'ZIP_UNSAFE_PATH',
          severity: 'error',
          title: 'Caminho interno inseguro',
          detail: normalized.reason ?? 'O caminho interno será ignorado no reparo.',
          file: originalName,
          repairable: true,
        }),
      );
      continue;
    }

    if (zipEntry.dir) continue;

    if (files.has(normalized.path)) {
      issues.push(
        createIssue({
          code: 'ZIP_NAME_COLLISION',
          severity: 'error',
          title: 'Colisão de caminho após normalização',
          detail: `Mais de um arquivo virou "${normalized.path}" após normalização.`,
          file: normalized.path,
          repairable: true,
        }),
      );
      continue;
    }

    files.set(normalized.path, {
      path: normalized.path,
      bytes: await zipEntry.async('uint8array'),
      directory: false,
      unsafeOriginalName: normalized.original === normalized.path ? undefined : normalized.original,
    });
  }

  fileNames.sort((a, b) => a.localeCompare(b));

  return {
    fileName,
    fileSize: bytes.length,
    bytes,
    zip,
    rawEntries: raw.entries,
    files,
    fileNames,
    issues,
    validZip: true,
  };
}
