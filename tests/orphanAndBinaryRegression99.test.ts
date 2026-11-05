// @vitest-environment jsdom
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { repairEpub } from '../src/epub/repair/repairEpub';
import { auditPreservation } from '../src/epub/repair/preservationAudit';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { parsePackageDocument } from '../src/epub/validation/opfParser';

// O jsdom não implementa Blob.arrayBuffer; navegadores modernos implementam.
beforeAll(() => {
  if (typeof Blob.prototype.arrayBuffer === 'function') return;
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
});

describe('Resguardo de conteúdo e recursos do EPUB', () => {
  it('E-004: sanitiza XHTML órfão quando passa a constar no manifest', async () => {
    const zip = await JSZip.loadAsync(await buildKindleIssueEpub());
    zip.file('OEBPS/Text/orfao.xhtml',
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Apêndice</h1>' +
      '<script>alert(1)</script></body></html>');
    const source = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const result = await repairEpub('livro.epub', source);
    expect(result.changed).toBe(true);
    expect(result.blob).toBeDefined();
    const output = await JSZip.loadAsync(await result.blob!.arrayBuffer());
    const extra = await output.file('OEBPS/Text/orfao.xhtml')!.async('string');
    expect(extra).not.toContain('<script');
    expect(extra).toContain('Apêndice');
    const opf = await output.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('orfao.xhtml');
  });

  it('E-051/E-058: sinaliza executável sem removê-lo nem alegar infecção', async () => {
    const zip = await JSZip.loadAsync(await buildKindleIssueEpub());
    zip.file('OEBPS/anexo.exe', Uint8Array.from([0x4d, 0x5a, 1, 2]));
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const report = await inspectEpub('amostra.epub', bytes);
    expect(report.issues.some((issue) => issue.code === 'PACKAGE_SUSPICIOUS_EXECUTABLE'))
      .toBe(true);
    expect(report.stats.securityScore).toBeLessThan(100);
  });

  it('E-064/E-066: auditoria preserva texto e bytes de recursos não modificados', async () => {
    const original = await loadEpub('livro.epub', await buildKindleIssueEpub());
    const pkg = parsePackageDocument(original).packageInfo;
    expect(pkg).toBeDefined();
    if (!pkg) return;
    const files = new Map(Array.from(original.files, ([path, entry]) => [path, entry.bytes]));
    expect(auditPreservation(original, files, pkg, pkg)).toEqual([]);
  });
});
