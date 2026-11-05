import JSZip from 'jszip';
import {
  MAX_FILE_SIZE_BYTES,
  MAX_ZIP_ENTRY_BYTES,
  MAX_ZIP_UNCOMPRESSED_BYTES,
} from '../utils/constants';
import type { EpubEntry, LoadedEpub } from '../model/epubTypes';
import { createIssue } from '../utils/issueFactory';
import type { IssueCode } from '../model/issueTypes';
import { normalizeInternalPath } from '../utils/pathUtils';
import { parseZipCentralDirectory } from './rawZipInspector';

class ZipIntegrityError extends Error {
  constructor(readonly code: IssueCode, message: string) {
    super(message);
    this.name = 'ZipIntegrityError';
  }
}

export async function loadEpub(fileName: string, bytes: Uint8Array): Promise<LoadedEpub> {
  const raw = bytes.length <= MAX_FILE_SIZE_BYTES
    ? parseZipCentralDirectory(bytes)
    : {
        entries: [],
        issues: [
          createIssue({
            code: 'ZIP_RESOURCE_LIMIT',
            severity: 'fatal' as const,
            title: 'EPUB acima do limite de tamanho',
            detail: 'O arquivo excede o limite de entrada aceito pelo aplicativo.',
            repairable: false,
          }),
        ],
      };
  if (raw.issues.some((issue) => issue.severity === 'fatal')) {
    return {
      fileName,
      fileSize: bytes.length,
      bytes,
      rawEntries: raw.entries,
      files: new Map(),
      fileNames: [],
      issues: raw.issues,
      validZip: false,
    };
  }

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
  let totalUncompressedBytes = 0;
  const rawByPath = new Map(raw.entries.map((entry) => [entry.fileName, entry]));

  for (const [originalName, zipEntry] of Object.entries(zip.files)) {
    const archivedName = (zipEntry as JSZip.JSZipObject & {
      unsafeOriginalName?: string;
    }).unsafeOriginalName ?? originalName;
    const normalized = normalizeInternalPath(archivedName);
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

    try {
      const remaining = MAX_ZIP_UNCOMPRESSED_BYTES - totalUncompressedBytes;
      const unpacked = await readZipEntryLimited(zipEntry, Math.min(MAX_ZIP_ENTRY_BYTES, remaining));
      const metadata = rawByPath.get(normalized.path);
      if (!metadata) {
        throw new ZipIntegrityError('ZIP_JSZIP_ENTRY_MISMATCH',
          'A entrada do JSZip não corresponde a um registro do diretório central.');
      }
      if (unpacked.bytes.length !== metadata.uncompressedSize) {
        throw new ZipIntegrityError('ZIP_SIZE_MISMATCH',
          'O tamanho real descompactado difere do declarado no diretório central ZIP.');
      }
      if (unpacked.crc32 !== metadata.crc32) {
        throw new ZipIntegrityError('ZIP_CRC_MISMATCH',
          'Falha de integridade CRC32: a entrada ZIP foi adulterada ou corrompida.');
      }
      const entryBytes = unpacked.bytes;
      totalUncompressedBytes += entryBytes.length;
      files.set(normalized.path, {
        path: normalized.path,
        bytes: entryBytes,
        directory: false,
        unsafeOriginalName: normalized.original === normalized.path ? undefined : normalized.original,
      });
    } catch (error) {
      return {
        fileName,
        fileSize: bytes.length,
        bytes,
        rawEntries: raw.entries,
        files: new Map(),
        fileNames: [],
        issues: [
          ...issues,
          createIssue({
            code: error instanceof ZipIntegrityError ? error.code : 'ZIP_RESOURCE_LIMIT',
            severity: 'fatal',
            title: 'Descompactação interrompida por segurança',
            detail: error instanceof Error ? error.message : 'Entrada ZIP inválida ou muito grande.',
            file: normalized.path,
            repairable: false,
          }),
        ],
        validZip: false,
      };
    }
  }

  // O JSZip pode normalizar nomes e ignorar registros ambíguos. Garantir que
  // toda entrada física segura e não diretório exista exatamente no mapa final.
  const missingFromJsZip = raw.entries.find((entry) =>
    !entry.isDirectory && normalizeInternalPath(entry.fileName).safe &&
    !files.has(entry.fileName));
  if (missingFromJsZip) {
    return {
      fileName, fileSize: bytes.length, bytes, rawEntries: raw.entries,
      files: new Map(), fileNames: [], validZip: false,
      issues: [...issues, createIssue({
        code: 'ZIP_JSZIP_ENTRY_MISMATCH', severity: 'fatal',
        title: 'Arquivo físico não encontrado após a extração',
        detail: 'A entrada do diretório central foi omitida ou renomeada pelo extrator JSZip.',
        file: missingFromJsZip.fileName, repairable: false,
      })],
    };
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

/**
 * Descompacta por blocos, evitando que tamanhos forjados no ZIP contornem
 * o limite baseado nos metadados. Pausa a stream antes de acumular o bloco excedente.
 */
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return crc >>> 0;
});

function readZipEntryLimited(
  entry: JSZip.JSZipObject,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; crc32: number }> {
  return new Promise((resolve, reject) => {
    // JSZip 3.x implementa internalStream em JSZipObject, mas não o expõe na interface pública.
    // O tipo limitado documenta somente a superfície utilizada pelo leitor por blocos.
    const stream = (entry as JSZip.JSZipObject & {
      internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array>;
    }).internalStream('uint8array');
    const chunks: Uint8Array[] = [];
    let length = 0;
    let crc = 0xffffffff;
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      stream.pause();
      chunks.length = 0;
      reject(error);
    };

    stream
      .on('data', (chunk) => {
        if (settled) return;
        if (chunk.length > maxBytes - length) {
          fail(new Error('O conteúdo descompactado excede o limite de memória permitido.'));
          return;
        }
        length += chunk.length;
        for (const byte of chunk) {
          crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
        }
        chunks.push(chunk);
      })
      .on('error', fail)
      .on('end', () => {
        if (settled) return;
        settled = true;
        const output = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          output.set(chunk, offset);
          offset += chunk.length;
        }
        resolve({ bytes: output, crc32: (crc ^ 0xffffffff) >>> 0 });
      })
      .resume();
  });
}
