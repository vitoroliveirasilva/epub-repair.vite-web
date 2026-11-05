import type { ZipEntryInfo } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import { createIssue } from '../utils/issueFactory';
import {
  MAX_ZIP_COMPRESSION_RATIO,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_ENTRY_BYTES,
  MAX_ZIP_UNCOMPRESSED_BYTES,
} from '../utils/constants';
import { normalizeInternalPath } from '../utils/pathUtils';

function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUInt32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function decodeFileName(bytes: Uint8Array): string {
  // Não converter bytes CP437/charset legado silenciosamente em U+FFFD.
  // Arquivos com nomes sem UTF-8 confiável exigem conversão manual para evitar colisões.
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function parseZipCentralDirectory(bytes: Uint8Array): {
  entries: ZipEntryInfo[];
  issues: Issue[];
} {
  const issues: Issue[] = [];
  const entries: ZipEntryInfo[] = [];

  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return {
      entries,
      issues: [
        createIssue({
          code: 'ZIP_INVALID',
          severity: 'fatal',
          title: 'Arquivo ZIP inválido',
          detail: 'O EPUB não começa com uma assinatura ZIP válida.',
          repairable: false,
        }),
      ],
    };
  }

  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) {
    return {
      entries,
      issues: [
        createIssue({
          code: 'ZIP_INVALID',
          severity: 'fatal',
          title: 'Diretório central do ZIP não encontrado',
          detail: 'O arquivo parece estar corrompido, incompleto ou truncado.',
          repairable: false,
        }),
      ],
    };
  }

  const totalEntriesOnDisk = readUInt16LE(bytes, eocdOffset + 8);
  const totalEntries = readUInt16LE(bytes, eocdOffset + 10);
  const diskNumber = readUInt16LE(bytes, eocdOffset + 4);
  const centralDisk = readUInt16LE(bytes, eocdOffset + 6);
  const centralDirSize = readUInt32LE(bytes, eocdOffset + 12);
  const centralDirOffset = readUInt32LE(bytes, eocdOffset + 16);
  const centralDirEnd = centralDirOffset + centralDirSize;

  if (
    diskNumber !== 0 ||
    centralDisk !== 0 ||
    totalEntriesOnDisk !== totalEntries ||
    totalEntries === 0xffff ||
    centralDirSize === 0xffffffff ||
    centralDirOffset === 0xffffffff ||
    totalEntries > MAX_ZIP_ENTRIES ||
    centralDirEnd > eocdOffset ||
    centralDirOffset < 0
  ) {
    return {
      entries,
      issues: [
        createIssue({
          code: 'ZIP_RESOURCE_LIMIT',
          severity: 'fatal',
          title: 'ZIP excede limites seguros ou usa formato não suportado',
          detail: 'Arquivo multipartes, ZIP64, excesso de entradas ou diretório central inconsistente.',
          repairable: false,
        }),
      ],
    };
  }

  let cursor = centralDirOffset;
  let totalUncompressed = 0;
  const seen = new Map<string, number>();

  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > centralDirEnd || readUInt32LE(bytes, cursor) !== 0x02014b50) {
      issues.push(
        createIssue({
          code: 'ZIP_INVALID',
          severity: 'fatal',
          title: 'Entrada inválida no diretório central',
          detail: 'O ZIP tem metadados inconsistentes e pode falhar em leitores diferentes.',
          repairable: false,
        }),
      );
      break;
    }

    const flags = readUInt16LE(bytes, cursor + 8);
    const compressionMethod = readUInt16LE(bytes, cursor + 10);
    const crc32 = readUInt32LE(bytes, cursor + 16);
    const compressedSize = readUInt32LE(bytes, cursor + 20);
    const uncompressedSize = readUInt32LE(bytes, cursor + 24);
    const fileNameLength = readUInt16LE(bytes, cursor + 28);
    const extraLength = readUInt16LE(bytes, cursor + 30);
    const commentLength = readUInt16LE(bytes, cursor + 32);
    const localHeaderOffset = readUInt32LE(bytes, cursor + 42);
    const fileNameStart = cursor + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    const nextCursor = fileNameEnd + extraLength + commentLength;

    if (nextCursor > centralDirEnd) {
      issues.push(createIssue({
        code: 'ZIP_INVALID',
        severity: 'fatal',
        title: 'Entrada ZIP ultrapassa os limites do diretório central',
        detail: 'O nome, os campos extras ou o comentário excedem a área reservada.',
        repairable: false,
      }));
      break;
    }

    try {
      decodeFileName(bytes.subarray(fileNameStart, fileNameEnd));
    } catch {
      issues.push(createIssue({
        code: 'ZIP_UNSUPPORTED_FILENAME_ENCODING',
        severity: 'fatal',
        title: 'Nome de arquivo ZIP possui codificação não suportada',
        detail: (flags & 0x0800) !== 0
          ? 'O nome está marcado como UTF-8, mas contém bytes inválidos.'
          : 'Nome com codificação legada ou ambígua (por exemplo CP437). ' +
            'Converter externamente para UTF-8 antes de reparar evita nomes corrompidos.',
        repairable: false,
      }));
      break;
    }

    const localNameLength =
      localHeaderOffset + 30 <= centralDirOffset
        ? readUInt16LE(bytes, localHeaderOffset + 26)
        : 0;
    const localExtra = getLocalHeaderExtraLength(bytes, localHeaderOffset);
    const localNameStart = localHeaderOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    const localFlags = readUInt16LE(bytes, localHeaderOffset + 6);
    const localMethod = readUInt16LE(bytes, localHeaderOffset + 8);
    const localNameMatches =
      localNameLength === fileNameLength &&
      bytes.subarray(localNameStart, localNameEnd).every(
        (byte, position) => byte === bytes[fileNameStart + position],
      );
    if (
      nextCursor > centralDirEnd ||
      localHeaderOffset + 30 > centralDirOffset ||
      readUInt32LE(bytes, localHeaderOffset) !== 0x04034b50 ||
      localHeaderOffset + 30 + localNameLength + localExtra + compressedSize > centralDirOffset ||
      localFlags !== flags ||
      localMethod !== compressionMethod ||
      !localNameMatches ||
      (!(flags & 0x0008) && (
        readUInt32LE(bytes, localHeaderOffset + 14) !== crc32 ||
        readUInt32LE(bytes, localHeaderOffset + 18) !== compressedSize ||
        readUInt32LE(bytes, localHeaderOffset + 22) !== uncompressedSize
      ))
    ) {
      issues.push(
        createIssue({
          code: 'ZIP_INVALID',
          severity: 'fatal',
          title: 'Offsets ou tamanhos inválidos no ZIP',
          detail: 'Cabeçalhos locais e metadados do diretório central não são consistentes.',
          repairable: false,
        }),
      );
      break;
    }
    const normalized = normalizeInternalPath(
      decodeFileName(bytes.slice(fileNameStart, fileNameEnd)),
    );
    const localExtraLength = localExtra;
    const fileName = normalized.path || normalized.original;

    const entry: ZipEntryInfo = {
      fileName,
      compressionMethod,
      encrypted: (flags & 0x0001) === 0x0001,
      localHeaderOffset,
      compressedSize,
      uncompressedSize,
      crc32,
      extraFieldLength: localExtraLength,
      isDirectory: decodeFileName(bytes.slice(fileNameStart, fileNameEnd)).endsWith('/'),
    };

    entries.push(entry);

    if (!entry.isDirectory) {
      totalUncompressed += uncompressedSize;
      const ratio = uncompressedSize / Math.max(1, compressedSize);
      if (
        uncompressedSize > MAX_ZIP_ENTRY_BYTES ||
        totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES ||
        (uncompressedSize > 8 * 1024 * 1024 && ratio > MAX_ZIP_COMPRESSION_RATIO)
      ) {
        issues.push(
          createIssue({
            code: 'ZIP_RESOURCE_LIMIT',
            severity: 'fatal',
            title: 'EPUB pode esgotar a memória',
            detail: 'Os tamanhos ou a taxa de compressão declarados excedem os limites seguros.',
            repairable: false,
            file: fileName,
          }),
        );
        break;
      }
    }

    if (!normalized.safe) {
      issues.push(
        createIssue({
          code: 'ZIP_UNSAFE_PATH',
          severity: 'error',
          title: 'Caminho interno inseguro',
          detail: normalized.reason ?? 'O caminho não é seguro para ser preservado no EPUB.',
          file: normalized.original,
          repairable: true,
        }),
      );
    }

    const seenCount = seen.get(fileName) ?? 0;
    if (seenCount > 0) {
      issues.push(
        createIssue({
          code: 'ZIP_DUPLICATE_ENTRY',
          severity: 'warning',
          title: 'Entrada duplicada no ZIP',
          detail: `O caminho "${fileName}" aparece mais de uma vez no pacote.`,
          repairable: true,
          file: fileName,
        }),
      );
    }
    seen.set(fileName, seenCount + 1);

    if (entry.encrypted || (flags & 0x0040) !== 0) {
      issues.push(
        createIssue({
          code: 'ZIP_ENCRYPTED_ENTRY',
          severity: 'error',
          title: 'Entrada ZIP criptografada',
          detail: 'O app não remove DRM nem descriptografa conteúdo protegido.',
          repairable: false,
          file: fileName,
        }),
      );
    }

    cursor = nextCursor;
  }

  if (!issues.some((issue) => issue.severity === 'fatal') && cursor !== centralDirEnd) {
    issues.push(
      createIssue({
        code: 'ZIP_INVALID',
        severity: 'fatal',
        title: 'Diretório central com tamanho inconsistente',
        detail: 'O final das entradas não corresponde aos metadados do arquivo ZIP.',
        repairable: false,
      }),
    );
  }

  entries.sort((a, b) => a.localHeaderOffset - b.localHeaderOffset);
  issues.push(...validateMimetypeEntry(entries));

  return { entries, issues };
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const min = Math.max(0, bytes.length - 65557);
  for (let index = bytes.length - 22; index >= min; index -= 1) {
    if (
      readUInt32LE(bytes, index) === 0x06054b50 &&
      index + 22 + readUInt16LE(bytes, index + 20) === bytes.length
    ) return index;
  }
  return -1;
}

function getLocalHeaderExtraLength(bytes: Uint8Array, localHeaderOffset: number): number {
  if (
    localHeaderOffset + 30 > bytes.length ||
    readUInt32LE(bytes, localHeaderOffset) !== 0x04034b50
  ) {
    return 0;
  }
  return readUInt16LE(bytes, localHeaderOffset + 28);
}

function validateMimetypeEntry(entries: ZipEntryInfo[]): Issue[] {
  const issues: Issue[] = [];
  const mimetypeEntry = entries.find((entry) => entry.fileName === 'mimetype');

  if (!mimetypeEntry) {
    issues.push(
      createIssue({
        code: 'MIME_MISSING',
        severity: 'error',
        title: 'Arquivo mimetype ausente',
        detail: 'O EPUB precisa do arquivo mimetype na raiz para ser identificado corretamente.',
        repairable: true,
        file: 'mimetype',
      }),
    );
    return issues;
  }

  if (entries[0]?.fileName !== 'mimetype') {
    issues.push(
      createIssue({
        code: 'MIME_NOT_FIRST',
        severity: 'error',
        title: 'mimetype não é o primeiro item do ZIP',
        detail: 'O mimetype deve ser a primeira entrada física do pacote EPUB.',
        repairable: true,
        file: 'mimetype',
      }),
    );
  }

  if (mimetypeEntry.compressionMethod !== 0) {
    issues.push(
      createIssue({
        code: 'MIME_COMPRESSED',
        severity: 'error',
        title: 'mimetype está comprimido',
        detail: 'O mimetype deve ser armazenado sem compressão.',
        repairable: true,
        file: 'mimetype',
      }),
    );
  }

  if (mimetypeEntry.extraFieldLength > 0) {
    issues.push(
      createIssue({
        code: 'MIME_EXTRA_FIELD',
        severity: 'warning',
        title: 'mimetype possui extra field',
        detail: 'Alguns validadores são sensíveis a metadados extras no cabeçalho ZIP do mimetype.',
        repairable: true,
        file: 'mimetype',
      }),
    );
  }

  return issues;
}
