// @vitest-environment jsdom
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { repairEpub } from '../src/epub/repair/repairEpub';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';

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
  // Simula omissão do mimetype: diagnóstico oficial inequívoco e reparável.
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


/** EPUB 2 sintético: NCX intencionalmente válido, mas sem arquivo mimetype. */
function createInvalidEpub2(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('META-INF/container.xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OPS/content.opf" ' +
    'media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OPS/content.opf',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:01aa1223-3322-4b44-a555-666777888999</dc:identifier>' +
    '<dc:title>Fixture EPUB 2</dc:title><dc:language>pt-BR</dc:language>' +
    '</metadata><manifest>' +
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' +
    '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
    '</manifest><spine toc="ncx"><itemref idref="chapter"/></spine></package>');
  zip.file('OPS/toc.ncx',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">' +
    '<head><meta name="dtb:uid" content="urn:uuid:01aa1223-3322-4b44-a555-666777888999"/>' +
    '<meta name="dtb:depth" content="1"/>' +
    '<meta name="dtb:totalPageCount" content="0"/>' +
    '<meta name="dtb:maxPageNumber" content="0"/></head>' +
    '<docTitle><text>Fixture EPUB 2</text></docTitle><navMap>' +
    '<navPoint id="chapter1" playOrder="1"><navLabel><text>Capítulo 1</text></navLabel>' +
    '<content src="chapter.xhtml#start"/></navPoint></navMap></ncx>');
  zip.file('OPS/chapter.xhtml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR" xml:lang="pt-BR">' +
    '<head><title>Capítulo</title></head><body>' +
    '<h1 id="start">Capítulo 1</h1><p>Texto de referência EPUB 2.</p>' +
    '</body></html>');
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}


type MimetypeVariant = 'mimetype-compressed' | 'mimetype-wrong-content' | 'mimetype-out-of-order';

/** Mesmo livro EPUB3 válido, com erro físico OCF isolado no mimetype. */
async function makeMimetypeVariant(mode: MimetypeVariant): Promise<Uint8Array> {
  const original = await JSZip.loadAsync(await createInvalidEpub());
  const out = new JSZip();
  const originalContainer = original.file('META-INF/container.xml');
  if (!originalContainer) throw new Error('Fixture sem container OCF');
  if (mode === 'mimetype-out-of-order') {
    out.file('META-INF/container.xml', await originalContainer.async('uint8array'));
  }
  out.file('mimetype', mode === 'mimetype-wrong-content'
    ? 'application/epub+zip\n' : 'application/epub+zip', {
    compression: mode === 'mimetype-compressed' ? 'DEFLATE' : 'STORE',
  });
  for (const [name, file] of Object.entries(original.files)) {
    if (file.dir || (mode === 'mimetype-out-of-order' && name === 'META-INF/container.xml')) {
      continue;
    }
    out.file(name, await file.async('uint8array'));
  }
  return out.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

describe('Fixture sintética de conformidade oficial', () => {

  for (const variant of [
    'mimetype-compressed', 'mimetype-wrong-content', 'mimetype-out-of-order',
  ] as const) {
    it('E-030/E-091: EPUBCheck diferencial de ' + variant, async () => {
      const original = await makeMimetypeVariant(variant);
      const before = await inspectEpub('original-' + variant + '.epub', original);
      const expected = variant === 'mimetype-compressed' ? 'MIME_COMPRESSED'
        : variant === 'mimetype-out-of-order' ? 'MIME_NOT_FIRST' : 'MIME_INVALID_CONTENT';
      expect(before.issues.some((issue) => issue.code === expected)).toBe(true);
      const repaired = await repairEpub('original-' + variant + '.epub', original, {
        ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true,
      });
      expect(repaired.changed).toBe(true);
      expect(repaired.blob).toBeDefined();
      expect(repaired.after.stats.fatalCount).toBe(0);
      expect(repaired.after.issues.some((issue) => issue.code === expected)).toBe(false);
      const bytes = new Uint8Array(await repaired.blob!.arrayBuffer());
      const outputDir = process.env.EPUBCHECK_FIXTURE_OUTPUT;
      if (outputDir) {
        await mkdir(outputDir, { recursive: true });
        await writeFile(join(outputDir, 'original-invalid-' + variant + '.epub'),
          Buffer.from(original));
        await writeFile(join(outputDir, 'repaired-valid-' + variant + '.epub'),
          Buffer.from(bytes));
      }
    });
  }

  it('E-091: EPUBCheck verifica também um reparo de EPUB 2 com NCX válido', async () => {
    const source = await createInvalidEpub2();
    const before = await inspectEpub('original-epub2.epub', source);
    expect(before.issues.some((issue) => issue.code === 'MIME_MISSING')).toBe(true);
    const result = await repairEpub('original-epub2.epub', source, {
      ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true,
    });
    expect(result.changed).toBe(true);
    expect(result.blob).toBeDefined();
    expect(result.after.stats.fatalCount).toBe(0);
    const bytes = new Uint8Array(await result.blob!.arrayBuffer());
    const outputDir = process.env.EPUBCHECK_FIXTURE_OUTPUT;
    if (outputDir) {
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(outputDir, 'original-invalid-epub2.epub'), Buffer.from(source));
      await writeFile(join(outputDir, 'repaired-valid-epub2.epub'), Buffer.from(bytes));
    }
  });

  it('E-035/E-091: gera original inválido e EPUB corrigido para EPUBCheck externo', async () => {
    const original = await createInvalidEpub();
    const before = await inspectEpub('fixture.epub', original);
    expect(before.issues.some((issue) => issue.code === 'MIME_MISSING')).toBe(true);

    const result = await repairEpub('fixture.epub', original, {
      ...DEFAULT_REPAIR_OPTIONS,
      conservativeMode: true,
    });
    expect(result.changed).toBe(true);
    expect(result.blob).toBeDefined();
    expect(result.after.validZip).toBe(true);
    expect(result.after.stats.fatalCount).toBe(0);
    expect(result.after.issues.some((issue) => issue.code === 'MIME_MISSING')).toBe(false);

    // E-093: segundo reparo não deve reempacotar um EPUB já corrigido.
    const repairedBytes = new Uint8Array(await result.blob!.arrayBuffer());
    const second = await repairEpub('fixture-k.epub', repairedBytes, {
      ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true,
    });
    expect(second.changed).toBe(false);
    expect(second.blob).toBeUndefined();

    const outputDir = process.env.EPUBCHECK_FIXTURE_OUTPUT;
    if (outputDir && result.blob) {
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(outputDir, 'original-invalid.epub'), Buffer.from(original));
      await writeFile(join(outputDir, 'repaired-valid.epub'), Buffer.from(repairedBytes));
    }
  });
});
