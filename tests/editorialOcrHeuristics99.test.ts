// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { validateEditorialOcrQuality } from '../src/epub/validation/validateEditorialOcrQuality';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

function check(texts: string[]) {
  const files = new Map<string, { bytes: Uint8Array }>();
  const manifest = texts.map((text, i) => {
    const path = 'OPS/chapter-' + i + '.xhtml';
    files.set(path, { bytes: new TextEncoder().encode(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body>' + text + '</body></html>',
    ) });
    return { id: 'c' + i, mediaType: 'application/xhtml+xml',
      exists: true, resolvedPath: path };
  });
  const loaded = { files } as unknown as LoadedEpub;
  const pkg = { manifest } as unknown as PackageDocumentInfo;
  return validateEditorialOcrQuality(loaded, pkg);
}
describe('E-069: OCR sem reparo editorial especulativo', () => {
  it('diagnostica caracteres de substituição repetidos sem editar o texto', () => {
    const text = '<p>Corrupção � de � caracteres</p>';
    const issues = check([text]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('CONTENT_OCR_SUSPECT');
    expect(issues[0]?.repairable).toBe(false);
    expect(issues[0]?.severity).toBe('info');
  });
  it('percebe palavras quebradas por hifenização recorrente', () => {
    const text = '<p>interrup-\nção, parti-\ncipação e cola-\n boração.</p>';
    expect(check([text]).map((x) => x.code)).toContain('CONTENT_OCR_SUSPECT');
  });
  it('informa cabeçalhos numéricos repetidos sem apagar páginas', () => {
    const issues = check([
      '<p>Página 12</p><p>Texto diferente</p>',
      '<p>Página 13</p><p>Texto diferente 2</p>',
      '<p>Página 14</p><p>Texto diferente 3</p>',
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.file).toBeUndefined();
  });
  it('não confunde travessões, versos e um título comum com corrupção', () => {
    const body = '<h1>Capítulo</h1><p>— Olá, tudo bem?</p>' +
      '<p>O verso vem abaixo:\nAs palavras respiram.</p><p>Capítulo</p>';
    expect(check([body, body, body])).toEqual([]);
  });
  it('não marca texto OCR suspeito após somente uma quebra legítima', () => {
    expect(check(['<p>Não\nquebrar indevidamente a obra.</p>'])).toEqual([]);
  });
});
