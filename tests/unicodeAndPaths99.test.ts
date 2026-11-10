import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { parseZipCentralDirectory } from '../src/epub/reader/rawZipInspector';
import { EPUB_MIME } from '../src/epub/utils/constants';
import { normalizeInternalPath, resolveReference } from '../src/epub/utils/pathUtils';

describe('E-022/E-023/E-024/E-027: nomes ZIP e URLs internas', () => {
  it('preserva byte a byte os nomes UTF-8 com NFC, NFD, percentuais, #, ? e caixa', async () => {
    const names = [
      'OPS/Text/café.xhtml',
      'OPS/Text/cafe\u0301.xhtml',
      'OPS/Text/Caps.xhtml',
      'OPS/Text/caps.xhtml',
      'OPS/Text/chapter#one.xhtml',
      'OPS/Text/chapter%23one.xhtml',
      'OPS/Text/part?one.xhtml',
      'OPS/Text/100%done.xhtml',
    ];
    const zip = new JSZip();
    zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
    for (const [index, name] of names.entries()) {
      zip.file(name, `<p>Entrada ${index}</p>`, { createFolders: false });
    }
    const input = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const directory = parseZipCentralDirectory(input);
    expect(directory.issues.some((issue) => issue.severity === 'fatal')).toBe(false);
    const loaded = await loadEpub('unicode.epub', input);
    expect(loaded.validZip).toBe(true);
    expect(loaded.files.size).toBe(names.length + 1);
    for (const name of names) {
      expect(loaded.files.has(name)).toBe(true);
      expect(normalizeInternalPath(name).path).toBe(name);
    }
    
    expect(loaded.files.has('OPS/Text/Caps.xhtml')).toBe(true);
    expect(loaded.files.has('OPS/Text/caps.xhtml')).toBe(true);
    expect(names[0]).not.toBe(names[1]);
  });

  it('decodifica URLs uma vez, preserva nomes físicos e bloqueia travessia codificada', () => {
    const base = 'OPS/nav.xhtml';
    expect(resolveReference(base, 'Text/chapter%23one.xhtml#top').path)
      .toBe('OPS/Text/chapter#one.xhtml');
    expect(resolveReference(base, 'Text/chapter%2523one.xhtml').path)
      .toBe('OPS/Text/chapter%23one.xhtml');
    expect(resolveReference(base, 'Text/part%3Fone.xhtml').path)
      .toBe('OPS/Text/part?one.xhtml');
    expect(normalizeInternalPath('OPS/Text/part?one.xhtml').path)
      .toBe('OPS/Text/part?one.xhtml');
    expect(resolveReference(base, 'Text/part%2Fone.xhtml').path)
      .toBe('OPS/Text/part/one.xhtml');
    expect(normalizeInternalPath('OPS/Text/part%2Fone.xhtml').path)
      .toBe('OPS/Text/part%2Fone.xhtml');
    expect(resolveReference(base, '%2E%2E/%2E%2E/evil.xhtml').safe).toBe(false);
    expect(resolveReference(base, 'Text/%252E%252E.xhtml').path)
      .toBe('OPS/Text/%2E%2E.xhtml');
  });
});
