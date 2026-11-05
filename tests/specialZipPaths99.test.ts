// @vitest-environment jsdom
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { rebuildEpubZip } from '../src/epub/repair/rebuildEpubZip';
import { EPUB_MIME } from '../src/epub/utils/constants';
import { normalizeInternalPath, resolveReference } from '../src/epub/utils/pathUtils';

beforeAll(() => {
  if (typeof Blob.prototype.arrayBuffer === 'function') return;
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error('Blob não legível'));
      reader.readAsArrayBuffer(this);
    });
  };
});

describe('E-027: nomes especiais e round-trip físico ZIP', () => {
  const names = ['OPS/cap#itulo.xhtml', 'OPS/título?.xhtml', 'OPS/100%real.xhtml',
    'OPS/percent%23literal.xhtml', 'OPS/a b.xhtml',
    'OPS/seção.xhtml', 'OPS/cafe\u0301.xhtml', 'OPS/café.xhtml',
    'OPS/um.dois.xhtml'];
  async function make() {
    const zip = new JSZip();
    zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
    for (const [index, name] of names.entries()) {
      zip.file(name, '<p>' + index + '</p>', { createFolders: false });
    }
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }
  it('mantém nomes físicos #, ?, %, espaços e Unicode NFC/NFD sem colapsá-los', async () => {
    const loaded = await loadEpub('especial.epub', await make());
    expect(loaded.validZip).toBe(true);
    for (const [index, name] of names.entries()) {
      const file = loaded.files.get(name);
      expect(file, name).toBeDefined();
      expect(new TextDecoder().decode(file!.bytes)).toBe('<p>' + index + '</p>');
    }
    expect(loaded.files.has('OPS/percent#literal.xhtml')).toBe(false);
    expect(loaded.files.has('OPS/cafe.xhtml')).toBe(false);
  });
  it('reempacota preservando bytes e nomes especiais distintos', async () => {
    const loaded = await loadEpub('especial.epub', await make());
    const original = new Map([...loaded.files].map(([name, entry]) =>
      [name, new Uint8Array(entry.bytes)]));
    const blob = await rebuildEpubZip(original);
    const next = await loadEpub('especial-reparado.epub',
      new Uint8Array(await blob.arrayBuffer()));
    expect(next.validZip).toBe(true);
    for (const name of names) {
      expect(next.files.get(name)?.bytes).toEqual(original.get(name));
    }
  });
  it('resolve escapes apenas nas referências URI sem afetar nomes ZIP', () => {
    expect(resolveReference('OPS/nav.xhtml', 'cap%23itulo.xhtml').path)
      .toBe('OPS/cap#itulo.xhtml');
    expect(resolveReference('OPS/nav.xhtml', 't%C3%ADtulo%3F.xhtml').path)
      .toBe('OPS/título?.xhtml');
    expect(resolveReference('OPS/nav.xhtml', '100%25real.xhtml').path)
      .toBe('OPS/100%real.xhtml');
    expect(normalizeInternalPath('OPS/100%25real.xhtml').path)
      .toBe('OPS/100%25real.xhtml');
  });
  it('rejeita escape da raiz e caminhos absolutos, sem sobrescrever destino', () => {
    expect(normalizeInternalPath('../../OPS/chapter.xhtml').safe).toBe(false);
    expect(normalizeInternalPath('/OPS/chapter.xhtml').safe).toBe(false);
    expect(normalizeInternalPath('C:\\OPS\\chapter.xhtml').safe).toBe(false);
    expect(normalizeInternalPath('OPS/Text/../chapter.xhtml').safe).toBe(true);
  });
});
