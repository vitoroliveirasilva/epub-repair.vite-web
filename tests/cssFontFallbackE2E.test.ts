
import { Blob as NodeBlob } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { repairEpub } from '../src/epub/repair/repairEpub';

describe('EPUB completo: fontes com fallbacks', () => {
  it('mantém fonte HTTPS e capítulos ao reparar CSS de EPUB 2', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    try {
      const zip = await JSZip.loadAsync(await buildKindleIssueEpub());
      const opf = await zip.file('OEBPS/content.opf')!.async('string');
      zip.file('OEBPS/content.opf', opf.replace('</manifest>',
        '<item id="font-css" href="Styles/fonts.css" media-type="text/css"/></manifest>'));
      const css = '@font-face{font-family:"Autor";' +
        'src:url("javascript:alert(1)");' +
        'src:url("https://fonts.example/autor.woff2") format("woff2");' +
        'font-display:swap}p{font-family:"Autor"}';
      zip.file('OEBPS/Styles/fonts.css', css);
      const original = new Uint8Array(await zip.generateAsync({
        type: 'uint8array', compression: 'DEFLATE',
      }));
      const result = await repairEpub('fonte-autor.epub', original);
      expect(result.changed).toBe(true);
      expect(result.blob).toBeDefined();
      const fixed = await JSZip.loadAsync(await result.blob!.arrayBuffer());
      const outputCss = await fixed.file('OEBPS/Styles/fonts.css')!.async('string');
      expect(outputCss).toContain('@font-face');
      expect(outputCss).toContain('https://fonts.example/autor.woff2');
      expect(outputCss).toContain('font-display:swap');
      expect(outputCss).not.toContain('javascript:');
      expect(fixed.file('OEBPS/Text/chapter1.xhtml')).not.toBeNull();
      expect(fixed.file('OEBPS/Text/chapter2.xhtml')).not.toBeNull();
      expect(result.after.validZip).toBe(true);
      expect(result.after.stats.fatalCount).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  }, 30000);
});
