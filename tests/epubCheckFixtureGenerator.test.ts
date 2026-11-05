// @vitest-environment jsdom
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { repairEpub } from '../src/epub/repair/repairEpub';
import { DEFAULT_REPAIR_OPTIONS, EPUB_MIME } from '../src/epub/utils/constants';

beforeAll(() => {
  // Vitest/jsdom ainda não fornece Blob.arrayBuffer.
  if (typeof Blob.prototype.arrayBuffer === 'function') return;
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error(reader.error?.message ?? 'Blob ilegível.'));
      reader.readAsArrayBuffer(this);
    });
  };
});

function createInvalidEpub(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', EPUB_MIME, { compression: 'DEFLATE' });
  zip.file('META-INF/container.xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/>' +
    '</rootfiles></container>');
  zip.file('OPS/book.opf',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:18a66eae-76b5-42ab-a892-ff1f553d0cbd</dc:identifier>' +
    '<dc:title>Fixture EPUBCheck</dc:title><dc:language>pt-BR</dc:language>' +
    '<meta property="dcterms:modified">2026-11-05T12:00:00Z</meta>' +
    '</metadata><manifest>' +
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
    '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
    '</manifest><spine><itemref idref="chapter"/></spine></package>');
  zip.file('OPS/nav.xhtml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" ' +
    'lang="pt-BR" xml:lang="pt-BR"><head><title>Navegação</title></head><body>' +
    '<nav epub:type="toc" id="toc"><h1>Sumário</h1><ol>' +
    '<li><a href="chapter.xhtml#inicio">Capítulo</a></li></ol></nav></body></html>');
  zip.file('OPS/chapter.xhtml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR" xml:lang="pt-BR">' +
    '<head><title>Capítulo</title></head><body>' +
    '<h1 id="inicio">Capítulo de teste</h1><p>Este texto precisa ser preservado.</p>' +
    '</body></html>');
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

describe('Fixture sintética de conformidade oficial', () => {
  it('E-035/E-091: gera original inválido e EPUB corrigido para EPUBCheck externo', async () => {
    const original = await createInvalidEpub();
    const before = await inspectEpub('fixture.epub', original);
    expect(before.issues.some((issue) => issue.code === 'MIME_COMPRESSED')).toBe(true);

    const result = await repairEpub('fixture.epub', original, {
      ...DEFAULT_REPAIR_OPTIONS,
      conservativeMode: true,
    });
    expect(result.changed).toBe(true);
    expect(result.blob).toBeDefined();
    expect(result.after.validZip).toBe(true);
    expect(result.after.stats.fatalCount).toBe(0);
    expect(result.after.issues.some((issue) => issue.code === 'MIME_COMPRESSED')).toBe(false);

    const outputDir = process.env.EPUBCHECK_FIXTURE_OUTPUT;
    if (outputDir && result.blob) {
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(outputDir, 'original-invalid.epub'), Buffer.from(original));
      await writeFile(join(outputDir, 'repaired-valid.epub'),
        Buffer.from(await result.blob.arrayBuffer()));
    }
  });
});
