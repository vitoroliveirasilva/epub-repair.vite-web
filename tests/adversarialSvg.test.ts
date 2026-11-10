
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
  it('detecta e neutraliza SVG ativo sem apagar recursos HTTPS legítimos', async () => {
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
    expect(doc.getElementsByTagName('image')[0]?.getAttribute('href')).toBe('https://evil.invalid/track');
    expect(doc.getElementById('keep')?.textContent).toBe('Conteúdo legítimo');
  });

  it('E-055: preserva imagem raster embutida no SVG, mas não data:SVG executável', async () => {
    const { sanitizeActiveContentMarkup } = await import(
      '../src/epub/sanitize/sanitizeActiveContent'
    );
    const original = '<svg xmlns="http://www.w3.org/2000/svg" ' +
      'xmlns:xlink="http://www.w3.org/1999/xlink">' +
      '<image id="raster" xlink:href="data:image/png;base64,AAECAw=="/>' +
      '<image id="active" href="data:image/svg+xml;base64,PHN2Zz4="/>' +
      '<image id="external" href="https://example.org/capa.png"/>' +
      '<a id="link" xlink:href="data:image/png;base64,AAECAw=="><text>Texto</text></a>' +
      '<foreignObject><p xmlns="http://www.w3.org/1999/xhtml">HTML ativo</p></foreignObject>' +
      '</svg>';
    const cleaned = sanitizeActiveContentMarkup(original, 'OPS/figure.svg', {
      sanitizeScripts: true, kindleSafeMode: true, removeRemoteResourceLinks: false,
    });
    const parsed = new DOMParser().parseFromString(cleaned.text, 'image/svg+xml');
    expect(parsed.getElementById('raster')?.getAttribute('xlink:href'))
      .toBe('data:image/png;base64,AAECAw==');
    expect(parsed.getElementById('active')?.hasAttribute('href')).toBe(false);
    expect(parsed.getElementById('external')?.getAttribute('href'))
      .toBe('https://example.org/capa.png');
    expect(parsed.getElementById('link')?.hasAttribute('xlink:href')).toBe(false);
    expect(parsed.getElementsByTagName('foreignObject')).toHaveLength(0);
    expect(parsed.getElementById('link')?.textContent).toBe('Texto');
  });

  it('E-053/E-055: detecta URL executável codificada como entidade antes do reparo', async () => {
    const zip = await JSZip.loadAsync(await buildKindleIssueEpub());
    const chapter = await zip.file('OEBPS/Text/chapter1.xhtml')!.async('string');
    zip.file('OEBPS/Text/chapter1.xhtml', chapter.replace('</body>',
      '<a href="java&#x73;cript:alert(1)">Link</a>' +
      '<img src="https://example.com/capa.png" alt="Capa remota"/>' +
      '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" alt="SVG"/>' +
      '<p onmouseover="alert(1)">Texto preservado</p></body>'));
    const loaded = await loadEpub('urls-escapadas.epub',
      await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
    const pkg = parsePackageDocument(loaded).packageInfo;
    if (!pkg) throw new Error('Fixture sem pacote OPF');
    const codes = validateContentReferences(loaded, pkg).map((issue) => issue.code);
    expect(codes).toContain('CONTENT_UNSAFE_URL');
    expect(codes).toContain('CONTENT_SCRIPTED');
    expect(codes).not.toContain('CONTENT_REMOTE_RESOURCE');
  });

  it('rejeita entidades XML personalizadas para evitar amplificação de texto', () => {
    const nested = '<!DOCTYPE root [<!ENTITY data "expandido">]><root>&data;</root>';
    expect(() => parseXml(nested)).toThrow(/Entidades XML/u);
  });

  it('E-056: mantém DOCTYPE público comum de NCX 2005 e XHTML 1.1', () => {
    const ncx = '<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" ' +
      '"http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">' +
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap/></ncx>';
    expect(parseXml(ncx).documentElement.localName).toBe('ncx');
    const xhtml = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" ' +
      '"http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">' +
      '<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>';
    expect(parseXml(xhtml, 'application/xhtml+xml').documentElement.localName).toBe('html');
  });

  it('E-056: rejeita DTD externa desconhecida, subset e inclusão XInclude', () => {
    expect(() => parseXml('<!DOCTYPE book SYSTEM "file:///etc/passwd"><book/>'))
      .toThrow(/DOCTYPE/u);
    expect(() => parseXml('<!DOCTYPE ncx [<!ELEMENT ncx ANY>]><ncx/>'))
      .toThrow(/DOCTYPE/u);
    expect(() => parseXml(
      '<root xmlns:xi="http://www.w3.org/2001/XInclude">' +
        '<xi:include href="file:///etc/passwd"/></root>',
    )).toThrow(/XInclude/u);
    expect(() => parseXml('<root><title>Seguro</title></root>')).not.toThrow();
  });

  it('preserva XML legítimo sem DTDs internos', () => {
    const doc = parseXml('<root><title>Leitura segura</title></root>');
    expect(doc.documentElement.querySelector('title')?.textContent).toBe('Leitura segura');
  });
});
