import type { ZipEntryInfo } from '../model/epubTypes';
import type { Issue, IssueCode } from '../model/issueTypes';
import { createIssue } from '../utils/issueFactory';
import {
  MAX_ZIP_COMPRESSION_RATIO,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_ENTRY_BYTES,
  MAX_ZIP_UNCOMPRESSED_BYTES,
} from '../utils/constants';
import { normalizeInternalPath } from '../utils/pathUtils';
import { decodeZipFileName } from './zipFileNameEncoding';

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


type ExtraFieldProblem = { code: IssueCode; title: string; detail: string };

function filenameCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Um extra field malformado ou ZIP64 não pode ser ignorado pelo leitor ZIP. */
function checkExtraFields(
  bytes: Uint8Array,
  start: number,
  length: number,
  rawName: Uint8Array,
): ExtraFieldProblem | undefined {
  const end = start + length;
  let cursor = start;
  while (cursor < end) {
    if (cursor + 4 > end) {
      return { code: 'ZIP_INVALID', title: 'Extra field ZIP truncado',
        detail: 'Cabeçalho incompleto em um extra field do arquivo ZIP.' };
    }
    const kind = readUInt16LE(bytes, cursor);
    const size = readUInt16LE(bytes, cursor + 2);
    const payload = cursor + 4;
    if (payload + size > end) {
      return { code: 'ZIP_INVALID', title: 'Extra field ZIP inválido',
        detail: 'O tamanho declarado do extra field ultrapassa os seus limites.' };
    }
    if (kind === 0x0001) {
      return { code: 'ZIP64_UNSUPPORTED', title: 'Entrada ZIP64 não suportada',
        detail: 'O EPUB usa um extra field ZIP64; não será reinterpretado como ZIP convencional.' };
    }
    if (kind === 0x7075) {
      if (size < 5 || bytes[payload] !== 1 ||
          readUInt32LE(bytes, payload + 1) !== filenameCrc32(rawName)) {
        return { code: 'ZIP_INVALID', title: 'Unicode Path ZIP inconsistente',
          detail: 'A versão, o tamanho ou o CRC do extra field Unicode Path é inválido.' };
      }
      try {
        const unicodeName = new TextDecoder('utf-8', { fatal: true })
          .decode(bytes.subarray(payload + 5, payload + size));
        const headerName = decodeZipFileName(rawName);
        if (unicodeName !== headerName) {
          return { code: 'ZIP_UNSUPPORTED_FILENAME_ENCODING',
            title: 'Nomes divergentes no ZIP',
            detail: 'O campo Unicode Path contradiz o nome do cabeçalho; a extração seria ambígua.' };
        }
      } catch {
        return { code: 'ZIP_UNSUPPORTED_FILENAME_ENCODING', title: 'Unicode Path inválido',
          detail: 'O extra field Unicode Path não contém texto UTF-8 válido.' };
      }
    }
    cursor = payload + size;
  }
  return undefined;
}

/** ZIP permite data descriptor com ou sem assinatura (12 ou 16 bytes).
 * É obrigatório validar CRC e tamanhos antes de confiar no payload.
 */
function dataDescriptorLength(
  bytes: Uint8Array,
  offset: number,
  limit: number,
  crc32: number,
  compressedSize: number,
  uncompressedSize: number,
): number {
  const matches = (start: number) => start + 12 <= limit &&
    readUInt32LE(bytes, start) === crc32 &&
    readUInt32LE(bytes, start + 4) === compressedSize &&
    readUInt32LE(bytes, start + 8) === uncompressedSize;
  if (matches(offset)) return 12;
  if (offset + 4 <= limit && readUInt32LE(bytes, offset) === 0x08074b50 &&
      matches(offset + 4)) return 16;
  return -1;
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

  const rejectArchive = (code: IssueCode, title: string, detail: string) => ({
    entries,
    issues: [createIssue({ code, severity: 'fatal' as const, title, detail, repairable: false })],
  });

  if (diskNumber !== 0 || centralDisk !== 0 || totalEntriesOnDisk !== totalEntries) {
    return rejectArchive('ZIP_MULTIPART_UNSUPPORTED', 'ZIP multipartes não suportado',
      'O arquivo indica volumes ou discos distintos. Reúna os volumes externamente antes de validar.');
  }
  if (totalEntries === 0xffff || totalEntriesOnDisk === 0xffff ||
      centralDirSize === 0xffffffff || centralDirOffset === 0xffffffff ||
      (eocdOffset >= 20 && readUInt32LE(bytes, eocdOffset - 20) === 0x07064b50)) {
    return rejectArchive('ZIP64_UNSUPPORTED', 'ZIP64 não suportado',
      'Localizador ZIP64 ou marcadores de tamanho/contagem estendidos encontrados.');
  }
  if (totalEntries > MAX_ZIP_ENTRIES) {
    return rejectArchive('ZIP_RESOURCE_LIMIT', 'Quantidade de arquivos excede o limite',
      'O pacote supera o número máximo de entradas aceito pelo aplicativo.');
  }
  if (centralDirEnd > eocdOffset || centralDirOffset < 0 ||
      (centralDirEnd !== eocdOffset &&
        readUInt32LE(bytes, centralDirEnd) !== 0x05054b50)) {
    return rejectArchive('ZIP_INVALID', 'Diretório central ZIP inconsistente',
      'Offsets ou tamanho do diretório central não correspondem ao fim do arquivo.');
  }

  let cursor = centralDirOffset;
  let totalUncompressed = 0;
  const seen = new Map<string, number>();
  const portableNames = new Map<string, string>();
  const localRanges: Array<{ start: number; end: number; name: string }> = [];

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

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff ||
        localHeaderOffset === 0xffffffff) {
      issues.push(createIssue({
        code: 'ZIP64_UNSUPPORTED', severity: 'fatal',
        title: 'Entrada usa tamanhos ZIP64',
        detail: 'Marcador ZIP64 encontrado em tamanho ou offset do diretório central.',
        repairable: false,
      }));
      break;
    }
    if (readUInt16LE(bytes, cursor + 34) !== 0) {
      issues.push(createIssue({
        code: 'ZIP_MULTIPART_UNSUPPORTED', severity: 'fatal',
        title: 'Entrada aponta para outro volume ZIP',
        detail: 'O disco inicial do registro não é zero.',
        repairable: false,
      }));
      break;
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      issues.push(createIssue({
        code: 'ZIP_UNSUPPORTED_COMPRESSION', severity: 'fatal',
        title: 'Compressão ZIP não suportada',
        detail: 'O leitor suporta somente STORE e DEFLATE, sem reinterpretar outros métodos.',
        repairable: false,
      }));
      break;
    }
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
      decodeZipFileName(bytes.subarray(fileNameStart, fileNameEnd), Boolean(flags & 0x0800));
    } catch {
      issues.push(createIssue({
        code: 'ZIP_UNSUPPORTED_FILENAME_ENCODING',
        severity: 'fatal',
        title: 'Nome de arquivo ZIP possui codificação não suportada',
        detail: 'O nome está marcado como UTF-8, mas contém bytes inválidos.',
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
    const rawName = bytes.subarray(fileNameStart, fileNameEnd);
    const extraProblem = checkExtraFields(
      bytes, fileNameEnd, extraLength, rawName,
    ) ?? checkExtraFields(bytes, localNameEnd, localExtra, rawName);
    if (extraProblem) {
      issues.push(createIssue({ ...extraProblem, severity: 'fatal', repairable: false }));
      break;
    }
    const payloadEnd = localNameEnd + localExtra + compressedSize;
    const descriptorLength = (flags & 0x0008) !== 0
      ? dataDescriptorLength(
          bytes, payloadEnd, centralDirOffset, crc32, compressedSize, uncompressedSize,
        )
      : 0;
    if (descriptorLength < 0) {
      issues.push(createIssue({
        code: 'ZIP_INVALID_DATA_DESCRIPTOR', severity: 'fatal',
        title: 'Descritor ZIP inválido ou ausente',
        detail: 'O CRC32 ou os tamanhos do data descriptor não coincidem com o diretório central.',
        repairable: false,
      }));
      break;
    }
    const normalized = normalizeInternalPath(decodeZipFileName(rawName, Boolean(flags & 0x0800)));
    const localExtraLength = localExtra;
    const fileName = normalized.path || normalized.original;

    const entry: ZipEntryInfo = {
      fileName,
      ...(normalized.safe ? {} : { unsafeOriginalName: normalized.original }),
      compressionMethod,
      encrypted: (flags & 0x0001) === 0x0001,
      localHeaderOffset,
      compressedSize,
      uncompressedSize,
      crc32,
      extraFieldLength: localExtraLength,
      isDirectory: decodeZipFileName(rawName, Boolean(flags & 0x0800)).endsWith('/'),
    };

    // Duas entradas ZIP não podem apontar para o mesmo cabeçalho local ou
    // disputar os mesmos bytes de payload: JSZip poderia escolher uma delas.
    const currentRange = {
      start: localHeaderOffset,
      end: payloadEnd + descriptorLength,
      name: fileName,
    };
    const overlapping = localRanges.find((range) =>
      currentRange.start < range.end && range.start < currentRange.end,
    );
    if (overlapping) {
      issues.push(createIssue({
        code: 'ZIP_OVERLAPPING_ENTRIES',
        severity: 'fatal',
        title: 'Entradas ZIP compartilham área física do arquivo',
        detail: `Os registros "${overlapping.name}" e "${fileName}" se sobrepõem. ` +
          'A extração e o reparo automático foram bloqueados por integridade.',
        file: fileName,
        repairable: false,
      }));
      break;
    }
    localRanges.push(currentRange);
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
          severity: 'fatal',
          title: 'Entrada duplicada no ZIP exige decisão manual',
          detail: `O caminho "${fileName}" aparece mais de uma vez. ` +
            'Não é seguro escolher qual versão do arquivo preservar automaticamente.',
          repairable: false,
          file: fileName,
        }),
      );
    }
    seen.set(fileName, seenCount + 1);

    // Sistemas de arquivos/leitores podem tratar diferenças de caixa e formas
    // Unicode como equivalentes. Não unificar nomes válidos: avisar somente.
    const portableKey = fileName.normalize('NFC').toLowerCase();
    const previousPortable = portableNames.get(portableKey);
    if (previousPortable && previousPortable !== fileName) {
      issues.push(createIssue({
        code: 'ZIP_PORTABLE_NAME_COLLISION',
        severity: 'info',
        title: 'Arquivos distintos podem colidir em leitores diferentes',
        detail: 'Os nomes "' + previousPortable + '" e "' + fileName +
          '" diferem apenas por caixa ou forma Unicode. O EPUB preserva ambos; ' +
          'confira as referências em leitores com sistema de arquivos insensível a caixa.',
        file: fileName,
        repairable: false,
      }));
    } else {
      portableNames.set(portableKey, fileName);
    }

    if (entry.encrypted || (flags & 0x0040) !== 0) {
      issues.push(
        createIssue({
          code: 'ZIP_ENCRYPTED_ENTRY',
          severity: 'fatal',
          title: 'Entrada ZIP criptografada',
          detail: 'O app não remove DRM nem descriptografa conteúdo protegido.',
          repairable: false,
          file: fileName,
        }),
      );
      break;
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
