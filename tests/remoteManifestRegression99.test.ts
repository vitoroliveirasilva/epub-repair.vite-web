// @vitest-environment jsdom
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { parsePackageDocument } from '../src/epub/validation/opfParser';
import { validateOpf } from '../src/epub/validation/validateOpf';
import { repairOpfDocument } from '../src/epub/repair/repairOpf';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';

describe('Recursos remotos legítimos no OPF', () => {
  it('E-014: preserva fonte remota HTTPS/HTTP no manifest em vez de tratá-la como arquivo ausente', async () => {
    const zip = await JSZip.loadAsync(await buildKindleIssueEpub());
    const opfFile = zip.file('OEBPS/content.opf');
    expect(opfFile).not.toBeNull();
    if (!opfFile) return;
    const original = await opfFile.async('string');
    zip.file('OEBPS/content.opf', original.replace('</manifest>',
      '<item id="webfont" href="https://cdn.example.org/font.woff2" media-type="font/woff2"/>' +
      '<item id="webfont2" href="http://cdn.example.org/old.woff" media-type="font/woff"/>' +
      '</manifest>'));
    const loaded = await loadEpub('livro.epub',
      await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
    const pkg = parsePackageDocument(loaded).packageInfo;
    expect(pkg).toBeDefined();
    if (!pkg) return;
    const external = pkg.manifest.filter((item) => item.remote);
    expect(external).toHaveLength(2);
    expect(external.map((item) => item.href)).toEqual([
      'https://cdn.example.org/font.woff2',
      'http://cdn.example.org/old.woff',
    ]);
    const missing = validateOpf(pkg, loaded).filter((issue) =>
      issue.code === 'OPF_MISSING_RESOURCE' && external.some((item) =>
        issue.file === item.resolvedPath));
    expect(missing).toHaveLength(0);
    const result = repairOpfDocument(loaded, pkg, 'livro.epub', DEFAULT_REPAIR_OPTIONS);
    expect(result.opfText).toContain('https://cdn.example.org/font.woff2');
    expect(result.opfText).toContain('http://cdn.example.org/old.woff');
    expect(result.actions.some((action) =>
      action.title === 'Item inválido removido do manifest' &&
      action.detail.includes('webfont'))).toBe(false);
  });

  it('E-014: javascript: no manifest não é recurso remoto permitido', async () => {
    const zip = await JSZip.loadAsync(await buildKindleIssueEpub());
    const opfFile = zip.file('OEBPS/content.opf');
    if (!opfFile) throw new Error('OPF não encontrado');
    zip.file('OEBPS/content.opf', (await opfFile.async('string')).replace('</manifest>',
      '<item id="unsafe" href="javascript:alert(1)" media-type="text/javascript"/></manifest>'));
    const loaded = await loadEpub('livro.epub',
      await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
    const pkg = parsePackageDocument(loaded).packageInfo;
    if (!pkg) throw new Error('OPF ausente');
    expect(validateOpf(pkg, loaded).some((issue) => issue.code === 'OPF_UNSAFE_HREF'))
      .toBe(true);
  });
});
