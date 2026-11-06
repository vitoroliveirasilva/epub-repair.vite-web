import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { parseZipCentralDirectory } from '../src/epub/reader/rawZipInspector';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { EPUB_MIME } from '../src/epub/utils/constants';

describe('E-023: colisões portáveis sem falso positivo de malware', () => {
  async function make(names: string[]) {
    const zip = new JSZip();
    zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
    for (const name of names) zip.file(name, 'Texto ' + name, { createFolders: false });
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }
  it('detecta colisão por maiúsculas sem apagar arquivos legalmente distintos', async () => {
    const data = await make(['OPS/Chapter.xhtml', 'OPS/chapter.xhtml']);
    const parsed = parseZipCentralDirectory(data);
    const matches = parsed.issues.filter((i) => i.code === 'ZIP_PORTABLE_NAME_COLLISION');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.severity).toBe('info');
    expect(parsed.issues.some((i) => i.severity === 'fatal')).toBe(false);
    const loaded = await loadEpub('case.epub', data);
    expect(loaded.validZip).toBe(true);
    expect(loaded.files.has('OPS/Chapter.xhtml')).toBe(true);
    expect(loaded.files.has('OPS/chapter.xhtml')).toBe(true);
  });
  it('detecta colisão por normalização Unicode composta/decomposta', async () => {
    const composed = 'OPS/café.xhtml';
    const decomposed = 'OPS/cafe\u0301.xhtml';
    const data = await make([composed, decomposed]);
    const parsed = parseZipCentralDirectory(data);
    expect(parsed.issues.some((i) => i.code === 'ZIP_PORTABLE_NAME_COLLISION')).toBe(true);
    const loaded = await loadEpub('unicode.epub', data);
    expect(loaded.files.has(composed)).toBe(true);
    expect(loaded.files.has(decomposed)).toBe(true);
  });
  it('não confunde arquivos com nomes realmente distintos', async () => {
    const parsed = parseZipCentralDirectory(await make(['OPS/Capitulo1.xhtml',
      'OPS/Capitulo2.xhtml']));
    expect(parsed.issues.some((i) => i.code === 'ZIP_PORTABLE_NAME_COLLISION')).toBe(false);
  });
});
