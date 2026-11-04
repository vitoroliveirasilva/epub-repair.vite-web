// @vitest-environment jsdom
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { repairContentDocuments } from '../src/epub/repair/repairContentDocuments';
import { parsePackageDocument } from '../src/epub/validation/opfParser';
import { validateContentReferences } from '../src/epub/validation/validateContentReferences';
import { parseXml } from '../src/epub/utils/xmlUtils';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';

describe('SVG e XML adversariais dentro de EPUBs', () => {
  it('detecta e neutraliza SVG com script, evento inline e recurso externo', async () => {
    const zip = await JSZip.loadAsync(await buildKindleIssueEpub());
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    zip.file(
      'OEBPS/content.opf',
      opf.replace('</manifest>', '<item id="svg" href="Images/evil.svg" media-type="image/svg+xml"/></manifest>'),
    );
    zip.file(
      'OEBPS/Images/evil.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">' +
        '<script>alert(2)</script>' +
        '<image href="https://evil.invalid/track" />' +
        '<text id="keep">Conteúdo legítimo</text></svg>',
    );
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const loaded = await loadEpub('svg-malicioso.epub', bytes);
    expect(loaded.validZip).toBe(true);

    const parsed = parsePackageDocument(loaded);
    if (!parsed.packageInfo) throw new Error('Fixture sem OPF');
    expect(validateContentReferences(loaded, parsed.packageInfo).some((issue) => issue.code === 'CONTENT_SCRIPTED'))
      .toBe(true);

    const files = new Map(Array.from(loaded.files, ([name, entry]) => [name, entry.bytes]));
    const actions = repairContentDocuments(files, loaded, parsed.packageInfo, DEFAULT_REPAIR_OPTIONS);
    expect(actions.some((action) => action.file === 'OEBPS/Images/evil.svg')).toBe(true);

    const updated = new TextDecoder().decode(files.get('OEBPS/Images/evil.svg'));
    const doc = new DOMParser().parseFromString(updated, 'image/svg+xml');
    expect(doc.getElementsByTagName('script')).toHaveLength(0);
    expect(doc.documentElement.hasAttribute('onload')).toBe(false);
    expect(doc.getElementsByTagName('image')[0]?.hasAttribute('href')).toBe(false);
    expect(doc.getElementById('keep')?.textContent).toBe('Conteúdo legítimo');
  });

  it('rejeita entidades XML personalizadas para evitar amplificação de texto', () => {
    const nested = '<!DOCTYPE root [<!ENTITY data "expandido">]><root>&data;</root>';
    expect(() => parseXml(nested)).toThrow(/Entidades XML/u);
  });

  it('preserva XML legítimo sem DTDs internos', () => {
    const doc = parseXml('<root><title>Leitura segura</title></root>');
    expect(doc.documentElement.querySelector('title')?.textContent).toBe('Leitura segura');
  });
});
