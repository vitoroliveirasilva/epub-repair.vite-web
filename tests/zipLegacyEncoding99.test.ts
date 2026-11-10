
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { parseZipCentralDirectory } from '../src/epub/reader/rawZipInspector';
import { loadEpub } from '../src/epub/reader/loadEpub';

async function zipWithName(name: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('OPS/' + name, 'Texto de prova', { compression: 'STORE' });
  return zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
}

 
function legacyName(bytes: Uint8Array): Uint8Array {
  const result = new Uint8Array(bytes);
  const name = new TextEncoder().encode('chapter.xhtml');
  let count = 0;
  for (let i = 0; i + name.length <= result.length; i += 1) {
    if (!name.every((byte, j) => result[i + j] === byte)) continue;
    result[i + 5] = 0x82; 
    i += name.length - 1;
    count += 1;
  }
  expect(count).toBe(2);
  return result;
}

describe('E-021: nomes ZIP antigos e flags UTF-8 sem corrupção silenciosa', () => {
  it('mantém nomes Unicode válidos e referências intactas', async () => {
    const source = await zipWithName('capítulo.xhtml');
    const inspected = parseZipCentralDirectory(source);
    expect(inspected.issues.some((i) => i.severity === 'fatal')).toBe(false);
    expect(inspected.entries.some((e) => e.fileName === 'OPS/capítulo.xhtml')).toBe(true);
  });

  it('decodifica CP437 e extrai os mesmos bytes sem converter para U+FFFD', async () => {
    const source = legacyName(await zipWithName('chapter.xhtml'));
    const inspected = parseZipCentralDirectory(source);
    expect(inspected.issues.some((i) => i.severity === 'fatal')).toBe(false);
    expect(inspected.entries.some((e) => e.fileName === 'OPS/chaptér.xhtml')).toBe(true);
    const loaded = await loadEpub('livro-legacy.epub', source);
    expect(loaded.validZip).toBe(true);
    expect(loaded.files.has('OPS/chaptér.xhtml')).toBe(true);
    expect(new TextDecoder().decode(loaded.files.get('OPS/chaptér.xhtml')?.bytes))
      .toBe('Texto de prova');
  });

  it('recusa nomes CP437 que colidem após normalização, sem escolher conteúdo', async () => {
    const source = new JSZip();
    source.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    source.file('OPS/a.xhtml', 'A');
    source.file('OPS/A.xhtml', 'B');
    const bytes = await source.generateAsync({ type: 'uint8array', compression: 'STORE' });
    const loaded = await loadEpub('a.epub', bytes);
    expect(loaded.validZip).toBe(true);
    expect(loaded.files.get('OPS/a.xhtml')?.bytes).toBeDefined();
    expect(loaded.issues.some((issue) =>
      issue.code === 'ZIP_PORTABLE_NAME_COLLISION')).toBe(true);
  });

  it('rejeita mentira na flag UTF-8 sem inferir o nome da obra', async () => {
    const source = legacyName(await zipWithName('chapter.xhtml'));
    
    for (let i = 0; i + 10 < source.length; i += 1) {
      const local = source[i] === 0x50 && source[i + 1] === 0x4b &&
        source[i + 2] === 0x03 && source[i + 3] === 0x04;
      const central = source[i] === 0x50 && source[i + 1] === 0x4b &&
        source[i + 2] === 0x01 && source[i + 3] === 0x02;
      if (local) source[i + 7] = source[i + 7]! | 0x08;
      if (central) source[i + 9] = source[i + 9]! | 0x08;
    }
    const inspected = parseZipCentralDirectory(source);
    expect(inspected.issues.find((i) => i.code === 'ZIP_UNSUPPORTED_FILENAME_ENCODING')
      ?.detail).toMatch(/marcado como UTF-8/u);
  });
});
