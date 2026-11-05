import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { parseZipCentralDirectory } from '../src/epub/reader/rawZipInspector';
import { EPUB_MIME } from '../src/epub/utils/constants';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';

function headers(bytes: Uint8Array): {
  view: DataView;
  eocd: number;
  central: number;
  local: number;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset--) {
    if (view.getUint32(offset, true) !== 0x06054b50) continue;
    const central = view.getUint32(offset + 16, true);
    return { view, eocd: offset, central, local: view.getUint32(central + 42, true) };
  }
  throw new Error('ZIP de teste sem EOCD');
}

function corrupt(bytes: Uint8Array, mutate: (parts: ReturnType<typeof headers>) => void): Uint8Array {
  const changed = new Uint8Array(bytes);
  mutate(headers(changed));
  return changed;
}

describe('arquivos EPUB maliciosos e ZIPs corrompidos', () => {
  it('mantém a leitura de uma fixture EPUB íntegra', async () => {
    const loaded = await loadEpub('fixture.epub', await buildKindleIssueEpub());
    expect(loaded.validZip).toBe(true);
    expect(loaded.files.has('mimetype')).toBe(true);
  });


  it('E-034: tamanho ZIP forjado é rejeitado mesmo com CRC32 legítimo', async () => {
    const original = await buildKindleIssueEpub();
    const changed = corrupt(original, ({ view, central, local }) => {
      const size = view.getUint32(central + 24, true);
      view.setUint32(central + 24, size + 1, true);
      view.setUint32(local + 22, size + 1, true);
    });
    expect(parseZipCentralDirectory(changed).issues.some((x) => x.severity === 'fatal'))
      .toBe(false);
    const loaded = await loadEpub('tamanho-forjado.epub', changed);
    expect(loaded.validZip).toBe(false);
    expect(loaded.files.size).toBe(0);
    expect(loaded.issues.some((x) => x.code === 'ZIP_SIZE_MISMATCH')).toBe(true);
  });

  it('rejeita CRC32 adulterado mesmo quando os dois cabeçalhos concordam', async () => {
    const original = await buildKindleIssueEpub();
    const input = corrupt(original, ({ view, central, local }) => {
      const falsified = (view.getUint32(central + 16, true) ^ 0x12345678) >>> 0;
      view.setUint32(central + 16, falsified, true);
      view.setUint32(local + 14, falsified, true);
    });
    expect(parseZipCentralDirectory(input).issues.some((issue) => issue.severity === 'fatal')).toBe(false);
    const loaded = await loadEpub('crc-corrompido.epub', input);
    expect(loaded.validZip).toBe(false);
    expect(loaded.files.size).toBe(0);
    expect(loaded.issues.some((issue) => /CRC32/u.test(issue.detail))).toBe(true);
  });

  it('E-021: rejeita nomes ZIP CP437 não decodificáveis sem corromper nomes', async () => {
    const original = await buildKindleIssueEpub();
    const input = corrupt(original, ({ view, central, local }) => {
      // Substitui o primeiro byte do nome nos dois cabeçalhos por byte CP437 não UTF-8.
      view.setUint8(local + 30, 0x82);
      view.setUint8(central + 46, 0x82);
    });
    const issues = parseZipCentralDirectory(input).issues;
    expect(issues.some((issue) => issue.code === 'ZIP_UNSUPPORTED_FILENAME_ENCODING'))
      .toBe(true);
    expect((await loadEpub('cp437.epub', input)).validZip).toBe(false);
  });

  it('E-024: acusa UTF-8 inválido mesmo com bit de codificação ativado', async () => {
    const original = await buildKindleIssueEpub();
    const input = corrupt(original, ({ view, central, local }) => {
      view.setUint16(central + 8, view.getUint16(central + 8, true) | 0x0800, true);
      view.setUint16(local + 6, view.getUint16(local + 6, true) | 0x0800, true);
      view.setUint8(local + 30, 0xc3);
      view.setUint8(central + 46, 0xc3);
    });
    expect(parseZipCentralDirectory(input).issues.some((issue) =>
      issue.code === 'ZIP_UNSUPPORTED_FILENAME_ENCODING')).toBe(true);
  });

  it('E-026/E-030: duplicação e sobreposição de registros ZIP são fatais', async () => {
    const zip = new JSZip();
    zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
    zip.file('OPS/a.xhtml', '<p>A</p>');
    zip.file('OPS/b.xhtml', '<p>B</p>');
    const original = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

    const records = (bytes: Uint8Array) => {
      const { view, central, eocd } = headers(bytes);
      const n = view.getUint16(eocd + 10, true);
      const out: Array<{ cursor: number; local: number; name: string }> = [];
      let cursor = central;
      for (let i = 0; i < n; i += 1) {
        const length = view.getUint16(cursor + 28, true);
        const name = String.fromCharCode(...bytes.subarray(cursor + 46, cursor + 46 + length));
        out.push({ cursor, name, local: view.getUint32(cursor + 42, true) });
        cursor += 46 + length + view.getUint16(cursor + 30, true) +
          view.getUint16(cursor + 32, true);
      }
      return out;
    };
    const [first, second] = [
      records(original).find((x) => x.name === 'OPS/a.xhtml'),
      records(original).find((x) => x.name === 'OPS/b.xhtml'),
    ];
    if (!first || !second) throw new Error('Fixture com nomes inesperados');

    const duplicate = new Uint8Array(original);
    for (let i = 0; i < first.name.length; i += 1) {
      duplicate[second.cursor + 46 + i] = duplicate[first.cursor + 46 + i]!;
      duplicate[second.local + 30 + i] = duplicate[first.local + 30 + i]!;
    }
    const duplicateIssues = parseZipCentralDirectory(duplicate).issues;
    expect(duplicateIssues.some((x) => x.code === 'ZIP_DUPLICATE_ENTRY' &&
      x.severity === 'fatal')).toBe(true);
    expect((await loadEpub('duplicado.epub', duplicate)).validZip).toBe(false);

    const overlap = new Uint8Array(original);
    const view = new DataView(overlap.buffer);
    for (let i = 0; i < first.name.length; i += 1) {
      overlap[second.cursor + 46 + i] = overlap[first.cursor + 46 + i]!;
    }
    // O segundo registro passa a apontar para o mesmo cabeçalho e payload do primeiro.
    for (const offset of [8, 10]) {
      view.setUint16(second.cursor + offset, view.getUint16(first.cursor + offset, true), true);
    }
    for (const offset of [16, 20, 24, 42]) {
      view.setUint32(second.cursor + offset, view.getUint32(first.cursor + offset, true), true);
    }
    expect(parseZipCentralDirectory(overlap).issues.some((x) =>
      x.code === 'ZIP_OVERLAPPING_ENTRIES' && x.severity === 'fatal')).toBe(true);
    expect((await loadEpub('sobreposto.epub', overlap)).validZip).toBe(false);
  });

  it('rejeita nome local divergente do diretório central', async () => {
    const original = await buildKindleIssueEpub();
    const input = corrupt(original, ({ view, local }) => {
      view.setUint8(local + 30, 0x78);
    });
    expect(parseZipCentralDirectory(input).issues.some((issue) => issue.code === 'ZIP_INVALID')).toBe(true);
  });

  it('rejeita contagens ZIP64 e número de entradas artificialmente elevado', async () => {
    const original = await buildKindleIssueEpub();
    for (const count of [0xffff, 10001]) {
      const input = corrupt(original, ({ view, eocd }) => {
        view.setUint16(eocd + 8, count, true);
        view.setUint16(eocd + 10, count, true);
      });
      expect((await loadEpub('excessivo.epub', input)).validZip).toBe(false);
    }
  });

  it('recusa payload altamente comprimido antes da descompactação', async () => {
    const zip = new JSZip();
    zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
    zip.file('OEBPS/Text/repetido.xhtml', new Uint8Array(12 * 1024 * 1024));
    const bytes = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });
    const result = await loadEpub('zip-bomb.epub', bytes);
    expect(result.validZip).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'ZIP_RESOURCE_LIMIT')).toBe(true);
    expect(result.files.size).toBe(0);
  }, 15_000);

  it('não inclui paths que escapam da raiz no mapa de arquivos', async () => {
    const zip = new JSZip();
    zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
    zip.file('../outside.xhtml', '<script>alert(1)</script>', { createFolders: false });
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const result = await loadEpub('zip-slip.epub', bytes);
    expect(result.files.has('outside.xhtml')).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'ZIP_UNSAFE_PATH')).toBe(true);
  });

  it('identifica ZIP criptografado sem considerá-lo saudável', async () => {
    const original = await buildKindleIssueEpub();
    const input = corrupt(original, ({ view, central, local }) => {
      view.setUint16(central + 8, view.getUint16(central + 8, true) | 1, true);
      view.setUint16(local + 6, view.getUint16(local + 6, true) | 1, true);
    });
    const loaded = await loadEpub('encrypted.epub', input);
    expect(loaded.issues.some((issue) => issue.code === 'ZIP_ENCRYPTED_ENTRY')).toBe(true);
  });


  it('E-025: aceita data descriptor padrão com assinatura e rejeita CRC adulterado', async () => {
    const zip = new JSZip();
    zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
    zip.file('OPS/chapter.xhtml', '<html><body><p>Texto preservado</p></body></html>');
    const original = await zip.generateAsync({
      type: 'uint8array', compression: 'DEFLATE', streamFiles: true,
    });
    expect(parseZipCentralDirectory(original).issues.some((issue) => issue.severity === 'fatal'))
      .toBe(false);
    expect((await loadEpub('descriptor-valido.epub', original)).validZip).toBe(true);

    const corrupted = new Uint8Array(original);
    const { view, central } = headers(corrupted);
    const compressedSize = view.getUint32(central + 20, true);
    const local = view.getUint32(central + 42, true);
    const descriptor = local + 30 + view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true) + compressedSize;
    expect(view.getUint32(descriptor, true)).toBe(0x08074b50);
    corrupted[descriptor + 4] = corrupted[descriptor + 4]! ^ 0x80;
    const issues = parseZipCentralDirectory(corrupted).issues;
    expect(issues.some((issue) => issue.code === 'ZIP_INVALID_DATA_DESCRIPTOR')).toBe(true);
    expect((await loadEpub('descriptor-errado.epub', corrupted)).validZip).toBe(false);
  });

  it('E-028: distingue ZIP64, multipartes e criptografia ZIP de falhas genéricas', async () => {
    const original = await buildKindleIssueEpub();
    const zip64 = corrupt(original, ({ view, eocd }) =>
      view.setUint32(eocd + 12, 0xffffffff, true));
    expect(parseZipCentralDirectory(zip64).issues.some((x) =>
      x.code === 'ZIP64_UNSUPPORTED' && x.severity === 'fatal')).toBe(true);

    const multi = corrupt(original, ({ view, eocd }) =>
      view.setUint16(eocd + 4, 1, true));
    expect(parseZipCentralDirectory(multi).issues.some((x) =>
      x.code === 'ZIP_MULTIPART_UNSUPPORTED' && x.severity === 'fatal')).toBe(true);

    const encrypted = corrupt(original, ({ view, central, local }) => {
      view.setUint16(central + 8, view.getUint16(central + 8, true) | 1, true);
      view.setUint16(local + 6, view.getUint16(local + 6, true) | 1, true);
    });
    const result = await loadEpub('criptografado.epub', encrypted);
    expect(result.validZip).toBe(false);
    expect(result.issues.some((x) =>
      x.code === 'ZIP_ENCRYPTED_ENTRY' && x.severity === 'fatal')).toBe(true);
  });

  it('E-025: rejeita campos extras malformados e compressão que não é EPUB', async () => {
    const zip = new JSZip();
    zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
    zip.file('OPS/text.xhtml', '<p>Texto</p>');
    const original = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const unsupportedMethod = corrupt(original, ({ view, central, local }) => {
      view.setUint16(central + 10, 12, true);
      view.setUint16(local + 8, 12, true);
    });
    expect(parseZipCentralDirectory(unsupportedMethod).issues.some((x) =>
      x.code === 'ZIP_UNSUPPORTED_COMPRESSION')).toBe(true);

    const badExtra = corrupt(original, ({ view, central }) => {
      // Simula cabeçalho de entrada central com comprimentos que avançam além do diretório.
      view.setUint16(central + 30, 0xffff, true);
    });
    expect(parseZipCentralDirectory(badExtra).issues.some((x) =>
      x.code === 'ZIP_INVALID')).toBe(true);
  });

  it('E-063: 128 mutações determinísticas não provocam exceção no parser ZIP', async () => {
    const original = await buildKindleIssueEpub();
    const { central, local, eocd } = headers(original);
    const regions = [local, local + 6, local + 14, local + 18, local + 26, central,
      central + 8, central + 16, central + 24, central + 28, central + 42,
      eocd + 4, eocd + 10, eocd + 16];
    for (let iteration = 0; iteration < 128; iteration += 1) {
      const mutated = new Uint8Array(original);
      const offset = regions[iteration % regions.length]! + Math.floor(iteration / regions.length) % 4;
      mutated[offset] = mutated[offset]! ^ ((iteration * 131 + 17) & 0xff);
      expect(() => parseZipCentralDirectory(mutated)).not.toThrow();
    }
  });

  it('permanece controlado ao ler 28 mutações de metadados ZIP', async () => {
    const original = await buildKindleIssueEpub();
    const { central, eocd, local } = headers(original);
    const offsets = [
      0, 1, 2, 3, local + 6, local + 8, local + 14, local + 18,
      local + 22, local + 26, local + 28, local + 30,
      central, central + 8, central + 10, central + 16,
      central + 20, central + 24, central + 28, central + 30,
      central + 32, central + 42, eocd + 4, eocd + 6,
      eocd + 8, eocd + 10, eocd + 12, eocd + 16,
    ];
    for (const [index, offset] of offsets.entries()) {
      const bytes = new Uint8Array(original);
      bytes[offset] = bytes[offset]! ^ ((index * 37 + 19) & 0xff);
      expect(() => parseZipCentralDirectory(bytes)).not.toThrow();
      await expect(loadEpub('mutated.epub', bytes)).resolves.toHaveProperty('validZip');
    }
  }, 15_000);
});
