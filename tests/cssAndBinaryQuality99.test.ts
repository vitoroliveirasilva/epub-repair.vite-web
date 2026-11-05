// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sniffBinaryKind, validateSuspiciousResources } from '../src/epub/validation/validateSuspiciousResources';
import { validateCssQuality } from '../src/epub/validation/validateCssQuality';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const bytes = (content: string) => new TextEncoder().encode(content);
const loadedWith = (entries: Array<[string, Uint8Array]>): LoadedEpub =>
  ({ files: new Map(entries.map(([path, value]) =>
    [path, { path, bytes: value, directory: false }])) } as unknown as LoadedEpub);

describe('E-058: identificação conservadora de assinaturas binárias', () => {
  it('reconhece PE, ELF, WASM, Java/Mach-O independentemente do nome', () => {
    const files: Array<[string, Uint8Array]> = [
      ['OPS/image.png', Uint8Array.from([0x4d, 0x5a, 0x00])],
      ['OPS/doc.xhtml', Uint8Array.from([0x7f, 0x45, 0x4c, 0x46])],
      ['OPS/fonte.woff', Uint8Array.from([0, 0x61, 0x73, 0x6d])],
      ['OPS/classe.txt', Uint8Array.from([0xca, 0xfe, 0xba, 0xbe])],
      ['OPS/capa.bin', Uint8Array.from([0xfe, 0xed, 0xfa, 0xce])],
    ];
    const flagged = validateSuspiciousResources(loadedWith(files));
    expect(flagged).toHaveLength(5);
    expect(flagged.every((issue) => issue.code === 'PACKAGE_SUSPICIOUS_EXECUTABLE')).toBe(true);
    expect(flagged.every((issue) => issue.repairable === false)).toBe(true);
  });
  it('avisa conflito JPEG/PNG, sem alarme para imagens/fonte válidas', () => {
    const image = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const goodFont = Uint8Array.from([0x77, 0x4f, 0x46, 0x32]);
    const report = validateSuspiciousResources(loadedWith([
      ['OPS/figura.jpg', image], ['OPS/capa.png', image],
      ['OPS/a.woff2', goodFont], ['OPS/link.css', bytes('@import url(https://example.com/style.css)')],
    ]));
    expect(report).toHaveLength(1);
    expect(report[0]?.code).toBe('PACKAGE_BINARY_SIGNATURE_MISMATCH');
    expect(sniffBinaryKind(image)).toBe('png');
  });
});

describe('E-070: diagnóstico CSS sem mudança editorial', () => {
  const validate = (content: string) => {
    const file = 'OPS/main.css';
    const loaded = loadedWith([[file, bytes(content)]]);
    const pkg = { manifest: [{ id: 'css', href: 'main.css', resolvedPath: file,
      pathSafe: true, exists: true, properties: [], mediaType: 'text/css' }] } as unknown as PackageDocumentInfo;
    return validateCssQuality(loaded, pkg);
  };
  it('identifica declaração repetida idêntica', () => {
    const issues = validate('p { color: red; color: red; line-height: 1.5; }');
    expect(issues.map((issue) => issue.code)).toContain('CSS_REDUNDANT_DECLARATION');
    expect(issues.every((issue) => issue.severity === 'info')).toBe(true);
  });
  it('identifica sobrescrita possivelmente proposital sem classificá-la como risco', () => {
    expect(validate('p { display: block; display: grid; }').map((i) => i.code))
      .toContain('CSS_CONFLICTING_DECLARATION');
  });
  it('ignora comentários e regras corretas', () => {
    expect(validate('/* p { color:red; color:red; } */ p { color: red; margin: 0 }'))
      .toEqual([]);
  });
  it('não altera CSS nem remove HTTP/HTTPS', () => {
    const css = '@import "https://example.com/a.css"; p { color: red; }';
    expect(validate(css)).toEqual([]);
  });
});
