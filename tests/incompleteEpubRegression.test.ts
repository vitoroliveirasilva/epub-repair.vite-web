import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { canRepairReport } from '../src/epub/utils/reportGuards';

async function incompleteEpub(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml',
    '<?xml version="1.0"?><container version="1.0" ' +
    'xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OEBPS/content.opf" ' +
    'media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OEBPS/Text/publisher.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" lang="pt" xml:lang="pt">' +
    '<head><title>Editora</title></head><body><p>Página da editora</p></body></html>');
  zip.file('OEBPS/content.opf',
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" ' +
    'unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:test</dc:identifier><dc:title>Exemplo</dc:title>' +
    '<dc:language>pt</dc:language></metadata><manifest>' +
    '<item id="publisher" href="Text/publisher.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="one" href="Text/one.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="two" href="Text/two.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="three" href="Text/three.xhtml" media-type="application/xhtml+xml"/>' +
    '</manifest><spine><itemref idref="publisher"/><itemref idref="one"/>' +
    '<itemref idref="two"/><itemref idref="three"/></spine></package>');
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

describe('EPUB cujo OPF anuncia capítulos que não existem no ZIP', () => {
  it('bloqueia reparo destrutivo e explica que o conteúdo não pode ser recuperado', async () => {
    const report = await inspectEpub('incompleto.epub', await incompleteEpub());
    const fatal = report.issues.find((issue) =>
      issue.code === 'OPF_READING_CONTENT_MISSING');
    const missing = report.issues.filter((issue) => issue.code === 'OPF_MISSING_RESOURCE');

    expect(fatal, JSON.stringify(report.issues.map((issue) =>
      [issue.code, issue.severity, issue.file]))).toBeDefined();
    expect(fatal?.severity).toBe('fatal');
    expect(fatal?.detail).toContain('3 arquivo(s) inexistente(s)');
    expect(missing).toHaveLength(3);
    expect(missing.every((issue) => !issue.repairable)).toBe(true);
    expect(canRepairReport(report)).toBe(false);
  });
});
