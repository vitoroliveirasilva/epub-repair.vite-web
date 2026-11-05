// @vitest-environment jsdom
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { parsePackageDocument } from '../src/epub/validation/opfParser';
import { validateOpf } from '../src/epub/validation/validateOpf';
import { repairOpfDocument } from '../src/epub/repair/repairOpf';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';

async function packageWithEdit(edit: (opf: string) => string) {
  const zip = await JSZip.loadAsync(await buildKindleIssueEpub());
  const entry = zip.file('OEBPS/content.opf');
  if (!entry) throw new Error('OPF não encontrado');
  zip.file('OEBPS/content.opf', edit(await entry.async('string')));
  zip.file('OEBPS/Text/extra.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Apêndice</p></body></html>');
  const loaded = await loadEpub('livro.epub',
    await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
  const pkg = parsePackageDocument(loaded).packageInfo;
  if (!pkg) throw new Error('OPF não interpretado');
  return { loaded, pkg };
}

describe('Integridade das dependências de IDs do manifest', () => {
  it('E-013: não renomeia um ID duplicado referenciado pelo spine', async () => {
    const { loaded, pkg } = await packageWithEdit((opf) => opf.replace('</manifest>',
      '<item id="chapter1" href="Text/extra.xhtml" media-type="application/xhtml+xml"/></manifest>'));
    const issue = validateOpf(pkg, loaded).find((item) =>
      item.code === 'OPF_DUPLICATE_ID');
    expect(issue?.repairable).toBe(false);
    const result = repairOpfDocument(loaded, pkg, 'livro.epub', DEFAULT_REPAIR_OPTIONS);
    const doc = new DOMParser().parseFromString(result.opfText, 'application/xml');
    const ids = Array.from(doc.getElementsByTagName('*'))
      .filter((element) => element.localName === 'item')
      .map((element) => element.getAttribute('id'));
    expect(ids.filter((id) => id === 'chapter1')).toHaveLength(2);
    expect(result.actions.some((item) => item.type === 'skipped' &&
      item.title.includes('ID duplicado'))).toBe(true);
  });


  it('E-013: mantém dependências spine, fallback, overlay e refines ao recusar ID ambíguo', async () => {
    const { loaded, pkg } = await packageWithEdit((opf) => opf
      .replace('</manifest>',
        '<item id="chapter1" href="Text/extra.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="fallbackRef" href="Text/another.xhtml" media-type="application/xhtml+xml" ' +
        'fallback="chapter1" media-overlay="chapter1"/></manifest>')
      .replace('</metadata>',
        '<meta property="title-type" refines="#chapter1">main</meta></metadata>'));
    const result = repairOpfDocument(loaded, pkg, 'livro.epub', DEFAULT_REPAIR_OPTIONS);
    const dom = new DOMParser().parseFromString(result.opfText, 'application/xml');
    const elements = Array.from(dom.getElementsByTagName('*'));
    const chapter1 = elements.filter((el) =>
      el.localName === 'item' && el.getAttribute('id') === 'chapter1');
    expect(chapter1).toHaveLength(2);
    const ref = elements.find((el) => el.getAttribute('id') === 'fallbackRef');
    expect(ref?.getAttribute('fallback')).toBe('chapter1');
    expect(ref?.getAttribute('media-overlay')).toBe('chapter1');
    const meta = elements.find((el) => el.getAttribute('refines') === '#chapter1');
    expect(meta?.textContent).toBe('main');
    expect(result.actions.some((action) =>
      action.type === 'skipped' && action.title.includes('ID duplicado'))).toBe(true);
  });

  it('E-041: detecta fallback inexistente, referências media-overlay e ciclos', async () => {
    const { loaded, pkg } = await packageWithEdit((opf) => opf
      .replace('id="chapter1" href=', 'id="chapter1" fallback="chapter2" href=')
      .replace('id="chapter2" href=', 'id="chapter2" fallback="chapter1" media-overlay="missing-smil" href='));
    const codes = validateOpf(pkg, loaded).map((issue) => issue.code);
    expect(codes).toContain('OPF_FALLBACK_CYCLE');
    expect(codes).toContain('OPF_MEDIA_OVERLAY_MISSING');
    const modified = pkg.manifest.find((item) => item.id === 'chapter1');
    if (!modified) throw new Error('Item ausente');
    modified.fallback = 'does-not-exist';
    expect(validateOpf(pkg, loaded).map((issue) => issue.code))
      .toContain('OPF_FALLBACK_MISSING');
  });
});
