import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { parseZipCentralDirectory } from '../src/epub/reader/rawZipInspector';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { EPUB_MIME } from '../src/epub/utils/constants';

async function base(comment?: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
  zip.file('OPS/chapter.xhtml', '<html><body><p>Texto</p></body></html>');
  return zip.generateAsync({
    type: 'uint8array', compression: 'DEFLATE',
    ...(comment ? { comment } : {}),
  });
}

describe('E-026: ZIP polyglots versus metadados ZIP legítimos', () => {
  it('rejeita prefixo PE executável antes do cabeçalho físico ZIP', async () => {
    const original = await base();
    const prefixed = new Uint8Array(original.length + 8);
    prefixed.set(Uint8Array.of(0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0));
    prefixed.set(original, 8);
    const parsed = parseZipCentralDirectory(prefixed);
    expect(parsed.issues.some((issue) => issue.severity === 'fatal')).toBe(true);
    const loaded = await loadEpub('pe-polyglot.epub', prefixed);
    expect(loaded.validZip).toBe(false);
    expect(loaded.files.size).toBe(0);
  });
  it('rejeita HTML prefixado como assinatura física EPUB', async () => {
    const original = await base();
    const header = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    const combined = new Uint8Array(header.length + original.length);
    combined.set(header);
    combined.set(original, header.length);
    expect(parseZipCentralDirectory(combined).issues.some((issue) =>
      issue.code === 'ZIP_INVALID')).toBe(true);
  });
  it('rejeita payload posterior ao EOCD não declarado como comentário ZIP', async () => {
    const original = await base();
    const appended = new Uint8Array(original.length + 17);
    appended.set(original);
    appended.set(new TextEncoder().encode('<script>1</script>'), original.length);
    const result = parseZipCentralDirectory(appended);
    expect(result.issues.some((issue) => issue.severity === 'fatal')).toBe(true);
  });
  it('não considera comentário ZIP bem formado como malware', async () => {
    const original = await base('Notas editoriais: <script>alert(1)</script>');
    const parsed = parseZipCentralDirectory(original);
    expect(parsed.issues.some((issue) => issue.severity === 'fatal')).toBe(false);
    const loaded = await loadEpub('comentario-valido.epub', original);
    expect(loaded.validZip).toBe(true);
    expect(loaded.files.has('OPS/chapter.xhtml')).toBe(true);
  });
});
