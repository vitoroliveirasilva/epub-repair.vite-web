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
