
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { parseZipCentralDirectory } from '../src/epub/reader/rawZipInspector';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { EPUB_MIME } from '../src/epub/utils/constants';

const zipBytes = async (modify: (zip: JSZip) => void) => {
  const zip = new JSZip();
  modify(zip);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
};

function injectLocalMimetypeExtra(original: Uint8Array): Uint8Array {
  const input = new DataView(original.buffer, original.byteOffset, original.byteLength);
  const eocd = original.length - 22;
  const central = input.getUint32(eocd + 16, true);
  const mimeLocal = 0;
  const insert = mimeLocal + 30 + input.getUint16(mimeLocal + 26, true);
  const extra = Uint8Array.of(0xfa, 0xce, 0, 0);
  const output = new Uint8Array(original.length + extra.length);
  output.set(original.subarray(0, insert));
  output.set(extra, insert);
  output.set(original.subarray(insert), insert + extra.length);
  const view = new DataView(output.buffer);
  view.setUint16(mimeLocal + 28, 4, true);
  view.setUint32(eocd + 4 + 16, central + 4, true);
  const count = input.getUint16(eocd + 10, true);
  let cursor = central + 4;
  for (let index = 0; index < count; index += 1) {
    const local = view.getUint32(cursor + 42, true);
    if (local > mimeLocal) view.setUint32(cursor + 42, local + 4, true);
    cursor += 46 + view.getUint16(cursor + 28, true) +
      view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
  }
  return output;
}

describe('E-025/E-030: OCF e extensões ZIP incomuns', () => {
  it('exige mimetype como primeira entrada física mesmo com diretório inicial', async () => {
    const data = await zipBytes((zip) => {
      zip.folder('OPS');
      zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
      zip.file('OPS/text.xhtml', '<html/>');
    });
    const raw = parseZipCentralDirectory(data);
    expect(raw.issues.some((issue) => issue.code === 'MIME_NOT_FIRST')).toBe(true);
    expect(raw.issues.some((issue) => issue.severity === 'fatal')).toBe(false);
  });

  it('não confunde arquivo vazio com ZIP inválido, mas mimetype vazio precisa de reparo', async () => {
    const data = await zipBytes((zip) => {
      zip.file('mimetype', '', { compression: 'STORE' });
      zip.file('OPS/empty.bin', new Uint8Array());
    });
    const raw = parseZipCentralDirectory(data);
    expect(raw.issues.some((issue) => issue.severity === 'fatal')).toBe(false);
    const loaded = await loadEpub('vazio.epub', data);
    expect(loaded.validZip).toBe(true);
    expect(loaded.files.get('OPS/empty.bin')?.bytes.length).toBe(0);
    const report = await inspectEpub('vazio.epub', data);
    expect(report.issues.some((issue) => issue.code === 'MIME_INVALID_CONTENT')).toBe(true);
  });

  it('identifica extra field local no mimetype e continua aceitando formato ZIP válido', async () => {
    const original = await zipBytes((zip) => {
      zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
      zip.file('OPS/a.xhtml', '<html/>');
    });
    const modified = injectLocalMimetypeExtra(original);
    const raw = parseZipCentralDirectory(modified);
    expect(raw.issues.some((issue) => issue.code === 'MIME_EXTRA_FIELD')).toBe(true);
    expect(raw.issues.some((issue) => issue.severity === 'fatal')).toBe(false);
    expect((await loadEpub('extra.epub', modified)).validZip).toBe(true);
  });

  it('aceita extra field Unicode consistente sem trocar o nome do arquivo', async () => {
    const data = await zipBytes((zip) => {
      zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
      zip.file('OPS/café.xhtml', '<html/>');
    });
    const raw = parseZipCentralDirectory(data);
    expect(raw.issues.some((issue) => issue.severity === 'fatal')).toBe(false);
    const loaded = await loadEpub('unicode.epub', data);
    expect(loaded.validZip).toBe(true);
    expect(loaded.files.has('OPS/café.xhtml')).toBe(true);
  });
});
