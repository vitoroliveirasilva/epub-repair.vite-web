import type { ZipEntryInfo } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import { createIssue } from '../utils/issueFactory';
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
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
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

  const totalEntries = readUInt16LE(bytes, eocdOffset + 10);
  const centralDirOffset = readUInt32LE(bytes, eocdOffset + 16);
  let cursor = centralDirOffset;
  const seen = new Map<string, number>();

  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > bytes.length || readUInt32LE(bytes, cursor) !== 0x02014b50) {
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
    const compressedSize = readUInt32LE(bytes, cursor + 20);
    const uncompressedSize = readUInt32LE(bytes, cursor + 24);
    const fileNameLength = readUInt16LE(bytes, cursor + 28);
    const extraLength = readUInt16LE(bytes, cursor + 30);
    const commentLength = readUInt16LE(bytes, cursor + 32);
    const localHeaderOffset = readUInt32LE(bytes, cursor + 42);
    const fileNameStart = cursor + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    const normalized = normalizeInternalPath(
      decodeFileName(bytes.slice(fileNameStart, fileNameEnd)),
    );
    const localExtraLength = getLocalHeaderExtraLength(bytes, localHeaderOffset);
    const fileName = normalized.path || normalized.original;

    const entry: ZipEntryInfo = {
      fileName,
      compressionMethod,
      encrypted: (flags & 0x0001) === 0x0001,
      localHeaderOffset,
      compressedSize,
      uncompressedSize,
      extraFieldLength: localExtraLength,
      isDirectory: fileName.endsWith('/'),
    };

    entries.push(entry);

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

    if (entry.encrypted) {
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

    cursor = fileNameEnd + extraLength + commentLength;
  }

  entries.sort((a, b) => a.localHeaderOffset - b.localHeaderOffset);
  issues.push(...validateMimetypeEntry(entries));

  return { entries, issues };
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const min = Math.max(0, bytes.length - 65557);
  for (let index = bytes.length - 22; index >= min; index -= 1) {
    if (readUInt32LE(bytes, index) === 0x06054b50) return index;
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
