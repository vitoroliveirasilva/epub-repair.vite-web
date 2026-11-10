
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { loadEpub } from '../src/epub/reader/loadEpub';

describe('E-031: fluxo ZIP sem cópia integral adicional dos chunks', () => {
  it('lê arquivo binário de 1 MiB em stream conferindo todos os bytes', async () => {
    const payload = new Uint8Array(1024 * 1024);
    for (let i = 0; i < payload.length; i++) payload[i] = (i * 67 + (i >>> 8)) & 0xff;
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    zip.file('OPS/payload.bin', payload);
    const result = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const loaded = await loadEpub('stream.epub', result);
    expect(loaded.validZip).toBe(true);
    expect(loaded.files.get('OPS/payload.bin')?.bytes).toEqual(payload);
  }, 20_000); 

  it('recompõe dezenas de entradas sem duplicar caminhos nem perder CRC32', async () => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    for (let i = 0; i < 48; i++) {
      const data = new Uint8Array(12_288);
      for (let j = 0; j < data.length; j++) data[j] = (i + j * 31) & 0xff;
      zip.file('OPS/resource-' + i.toString().padStart(2, '0') + '.bin', data);
    }
    const original = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const loaded = await loadEpub('multi.epub', original);
    expect(loaded.validZip).toBe(true);
    expect(loaded.files.size).toBe(49);
    expect(loaded.issues.some((issue) => issue.severity === 'fatal')).toBe(false);
    for (let i = 0; i < 48; i++) {
      expect(loaded.files.get('OPS/resource-' + i.toString().padStart(2, '0') +
        '.bin')?.bytes.length).toBe(12_288);
    }
  });
});
