// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { decodeUtf8ForRewrite } from '../src/epub/utils/textEncoding';
import { repairContentDocuments } from '../src/epub/repair/repairContentDocuments';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const encode = (text: string) => new TextEncoder().encode(text);

describe('E-033: não destruir charset na reescrita de documentos', () => {
  it('aceita XML UTF-8 com declaração e preserva texto Unicode', () => {
    const content = '<?xml version="1.0" encoding="UTF-8"?><p>São Paulo — ação</p>';
    expect(decodeUtf8ForRewrite(encode(content), 'OPS/chapter.xhtml')).toBe(content);
  });
  it('bloqueia UTF-16 em vez de decodificar com caracteres trocados', () => {
    expect(() => decodeUtf8ForRewrite(Uint8Array.of(0xff, 0xfe, 0x3c, 0x00),
      'OPS/chapter.xhtml')).toThrow(/UTF-16/u);
  });
  it('rejeita bytes inválidos e charset incompatível mesmo com ASCII aparente', () => {
    expect(() => decodeUtf8ForRewrite(Uint8Array.of(0x3c, 0x70, 0x3e, 0xe9),
      'OPS/chapter.xhtml')).toThrow(/Bytes não UTF-8/u);
    expect(() => decodeUtf8ForRewrite(encode(
      '<?xml version="1.0" encoding="ISO-8859-1"?><p>ação</p>'),
    'OPS/chapter.xhtml')).toThrow(/ISO-8859-1/u);
  });
  it('rejeita CSS com @charset não compatível sem remover fontes', () => {
    expect(() => decodeUtf8ForRewrite(encode('@charset "windows-1252";p{color:blue}'),
      'OPS/style.css')).toThrow(/windows-1252/u);
    expect(decodeUtf8ForRewrite(encode('@charset "UTF-8";p{color:blue}'),
      'OPS/style.css')).toContain('color:blue');
  });
  it('bloqueia fluxo real de sanitização quando XHTML seria alterado com charset ambíguo', () => {
    const path = 'OPS/chapter.xhtml';
    const source = encode('<?xml version="1.0" encoding="windows-1252"?>' +
      '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
      '<p>Texto importante</p><script>alert(1)</script></body></html>');
    const entry = { path, bytes: source, directory: false };
    const loaded = { files: new Map([[path, entry]]) } as unknown as LoadedEpub;
    const pkg = { manifest: [{
      id: 'c', href: 'chapter.xhtml', mediaType: 'application/xhtml+xml',
      resolvedPath: path, pathSafe: true, exists: true, properties: [],
    }] } as unknown as PackageDocumentInfo;
    const output = new Map([[path, source]]);
    expect(() => repairContentDocuments(output, loaded, pkg, DEFAULT_REPAIR_OPTIONS))
      .toThrow(/windows-1252/u);
    expect(output.get(path)).toEqual(source);
  });
});
