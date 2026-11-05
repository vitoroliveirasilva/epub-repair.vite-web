// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { validateContentReferences } from '../src/epub/validation/validateContentReferences';
import { extractDocumentResourceReferences } from '../src/epub/validation/referenceExtractor';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

function fixture(content: string, available: string[] = []) {
  const name = 'OPS/chapter.xhtml';
  const files = new Map([[name, {
    path: name, directory: false, bytes: new TextEncoder().encode(content),
  }]]);
  for (const path of available) files.set(path, {
    path, directory: false, bytes: new TextEncoder().encode('<svg/>'),
  });
  const loaded = { files } as LoadedEpub;
  const pkg = { manifest: [{
    id: 'c', href: 'chapter.xhtml', mediaType: 'application/xhtml+xml',
    properties: [], pathSafe: true, resolvedPath: name, exists: true,
  }] } as PackageDocumentInfo;
  return validateContentReferences(loaded, pkg);
}
const wrap = (body: string) =>
  '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Teste</title></head>' +
  '<body>' + body + '</body></html>';

describe('E-053: referências reais em DOM, não comentários nem exemplos editoriais', () => {
  it('ignora src e href dentro de comentário HTML e texto escapado', () => {
    const markup = wrap('<!-- <img src="ausente.png"/><a href="delete.xhtml"/> -->' +
      '<p>Exemplo: &lt;img src="outra.png"/&gt;</p>');
    const issues = fixture(markup);
    expect(issues.some((x) => x.code === 'CONTENT_MISSING_RESOURCE')).toBe(false);
    expect(issues.some((x) => x.code === 'CONTENT_UNSAFE_URL')).toBe(false);
  });
  it('continua detectando imagem realmente quebrada', () => {
    const issues = fixture(wrap('<img src="ausente.png"/>'));
    expect(issues.map((x) => x.code)).toContain('CONTENT_MISSING_RESOURCE');
  });
  it('preserva HTTPS legítimo e imagem local válida', () => {
    const issues = fixture(wrap('<a href="https://example.org">Fonte</a>' +
      '<img src="assets/cover.svg"/>'), ['OPS/assets/cover.svg']);
    expect(issues.some((x) => x.code === 'CONTENT_UNSAFE_URL' ||
      x.code === 'CONTENT_MISSING_RESOURCE')).toBe(false);
  });
  it('decodifica entidade de scheme no atributo real sem alterar URL segura', () => {
    const issues = fixture(wrap('<a href="java&#x73;cript:alert(1)">Perigo</a>' +
      '<a href="https://example.org">Fonte</a>'));
    expect(issues.map((x) => x.code)).toContain('CONTENT_UNSAFE_URL');
  });
  it('deteta kindle:embed em texto real, mas nunca em comentário', () => {
    const doc = new DOMParser().parseFromString(wrap(
      '<!-- kindle:embed:99 --><p>kindle:embed:42</p>'), 'application/xhtml+xml');
    const refs = extractDocumentResourceReferences(doc);
    expect(refs.filter((x) => x.attr === 'kindle:embed').map((x) => x.raw))
      .toEqual(['kindle:embed:42']);
  });
});
