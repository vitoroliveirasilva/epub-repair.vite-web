
import { describe, expect, it } from 'vitest';
import { validateContentReferences } from '../src/epub/validation/validateContentReferences';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const wrap = (body: string) =>
  '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Livro</title></head>' +
  '<body>' + body + '</body></html>';

function inspect(markup: string, mediaType = 'application/xhtml+xml') {
  const path = mediaType === 'image/svg+xml' ? 'OPS/image.svg' : 'OPS/chapter.xhtml';
  const loaded = { files: new Map([[path, { path,
    bytes: new TextEncoder().encode(markup), directory: false }]]) } as unknown as LoadedEpub;
  const pkg = { manifest: [{
    id: 'content', href: path, resolvedPath: path, exists: true, mediaType,
    pathSafe: true, properties: [],
  }] } as unknown as PackageDocumentInfo;
  return validateContentReferences(loaded, pkg);
}

describe('E-053/E-052: diagnóstico estrutural sem falso positivo de código literal', () => {
  it('não interpreta script e onclick escritos em comentários como execução', () => {
    const result = inspect(wrap('<!-- <script>alert(1)</script> <a onclick="bad()"> -->' +
      '<p>Comentário técnico sem execução</p>'));
    expect(result.filter((x) => [
      'CONTENT_SCRIPTED', 'CONTENT_UNSAFE_EMBED', 'CONTENT_UNSAFE_URL',
    ].includes(x.code))).toEqual([]);
  });
  it('não interpreta tags escapadas no texto editorial como elementos ativos', () => {
    const result = inspect(wrap(
      '<p>Código mostrado ao leitor: &lt;iframe src="https://example.org"&gt;</p>'));
    expect(result.filter((x) =>
      x.code === 'CONTENT_SCRIPTED' || x.code === 'CONTENT_UNSAFE_EMBED')).toEqual([]);
  });
  it('detecta script real e evento, mas preserva hyperlink HTTPS', () => {
    const result = inspect(wrap('<a href="https://example.org">Referência</a>' +
      '<p onclick="alert(1)">Texto</p><script>alert(2)</script>'));
    expect(result.some((x) => x.code === 'CONTENT_SCRIPTED')).toBe(true);
    expect(result.some((x) => x.code === 'CONTENT_UNSAFE_URL')).toBe(false);
  });
  it('detecta iframe real, SVG foreignObject e SVG animate', () => {
    expect(inspect(wrap('<iframe src="https://example.org"></iframe>')).some(
      (x) => x.code === 'CONTENT_UNSAFE_EMBED')).toBe(true);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<foreignObject/><animate attributeName="opacity" from="0" to="1"/></svg>';
    const result = inspect(svg, 'image/svg+xml');
    expect(result.map((x) => x.code)).toEqual(
      expect.arrayContaining(['CONTENT_UNSAFE_EMBED', 'CONTENT_SCRIPTED']));
  });
  it('não confunde comentário de SVG com foreignObject realmente ativo', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<!-- <foreignObject><script>alert(1)</script></foreignObject> -->' +
      '<text>Legenda</text></svg>';
    const issues = inspect(svg);
    expect(issues.some((x) => x.code === 'CONTENT_UNSAFE_EMBED')).toBe(false);
  });
});
