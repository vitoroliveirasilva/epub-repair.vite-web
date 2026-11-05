// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { parsePackageDocument } from '../src/epub/validation/opfParser';
import { repairOpfDocument } from '../src/epub/repair/repairOpf';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';
import { areEquivalentMediaTypes } from '../src/epub/utils/mediaTypes';
import { validateKindleCompatibility } from '../src/epub/validation/validateKindleCompatibility';

describe('Regressões do inventário de 99 itens', () => {
  it('E-003: recria a declaração de NCX ausente ao reparar o OPF', async () => {
    const loaded = await loadEpub('exemplo.epub', await buildKindleIssueEpub());
    loaded.files.delete('OEBPS/toc.ncx');
    const pkg = parsePackageDocument(loaded).packageInfo;
    expect(pkg).toBeDefined();
    if (!pkg) return;
    const result = repairOpfDocument(loaded, pkg, 'exemplo.epub', DEFAULT_REPAIR_OPTIONS);
    const opf = new DOMParser().parseFromString(result.opfText, 'application/xml');
    const ncxItems = Array.from(opf.querySelectorAll('item'))
      .filter((item) => item.getAttribute('media-type') === 'application/x-dtbncx+xml');
    expect(ncxItems).toHaveLength(1);
    expect(result.filesToAdd.has('OEBPS/toc.ncx')).toBe(true);
    expect(opf.querySelector('spine')?.getAttribute('toc'))
      .toBe(ncxItems[0]?.getAttribute('id'));
  });

  it('E-002: destino NCX quebrado exige revisão manual', async () => {
    const loaded = await loadEpub('exemplo.epub', await buildKindleIssueEpub());
    const pkg = parsePackageDocument(loaded).packageInfo;
    expect(pkg).toBeDefined();
    if (!pkg) return;
    const broken = validateKindleCompatibility(loaded, pkg)
      .find((item) => item.code === 'NCX_CONTENT_MISSING_RESOURCE');
    expect(broken?.repairable).toBe(false);
  });

  it('E-007: preserva equivalências válidas de MIME OpenType e TrueType', () => {
    expect(areEquivalentMediaTypes('application/vnd.ms-opentype', 'font/otf')).toBe(true);
    expect(areEquivalentMediaTypes('application/font-sfnt', 'font/ttf')).toBe(true);
    expect(areEquivalentMediaTypes('application/pdf', 'font/otf')).toBe(false);
  });
});
