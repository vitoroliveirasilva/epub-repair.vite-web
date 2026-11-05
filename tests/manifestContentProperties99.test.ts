// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { validateManifestContentProperties } from '../src/epub/validation/validateManifestContentProperties';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { ManifestItem, PackageDocumentInfo } from '../src/epub/model/opfTypes';

const encode = (s: string) => new TextEncoder().encode(s);
const xhtml = (body: string) =>
  '<html xmlns="http://www.w3.org/1999/xhtml" ' +
  'xmlns:svg="http://www.w3.org/2000/svg" ' +
  'xmlns:m="http://www.w3.org/1998/Math/MathML" ' +
  'xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Teste</title></head>' +
  '<body>' + body + '</body></html>';
function check(content: string, mediaType = 'application/xhtml+xml',
  properties: string[] = [], version = '3.3') {
  const path = 'OPS/document.' + (mediaType === 'text/css' ? 'css' :
    mediaType === 'image/svg+xml' ? 'svg' :
      mediaType === 'application/smil+xml' ? 'smil' : 'xhtml');
  const item: ManifestItem = { id: 'doc', href: path, resolvedPath: path,
    mediaType, properties, pathSafe: true, exists: true };
  const pkg = { version, manifest: [item] } as PackageDocumentInfo;
  const loaded = { files: new Map([[path, { path, bytes: encode(content) }]]) } as unknown as LoadedEpub;
  return validateManifestContentProperties(loaded, pkg);
}
const contexts = (issues: ReturnType<typeof check>) => issues.map((x) => x.context);
describe('E-042: propriedades obrigatórias EPUB3 sem confundir segurança com semântica', () => {
  it('detecta script, formulário, MathML e SVG inline declarados no próprio documento', () => {
    const body = '<script>alert(1)</script><form action="#"><input/></form>' +
      '<m:math><m:mi>x</m:mi></m:math><svg:svg><svg:circle r="2"/></svg:svg>' +
      '<epub:switch><epub:case required-namespace="urn:test"><p>Texto</p>' +
      '</epub:case></epub:switch>';
    const found = check(xhtml(body));
    expect(contexts(found)).toEqual(expect.arrayContaining(['scripted', 'mathml', 'svg', 'switch']));
    expect(found.every((issue) => issue.repairable === false &&
      issue.severity === 'warning')).toBe(true);
  });
  it('não marca JSON-LD nem CSS local como JavaScript executável', () => {
    const found = check(xhtml(
      '<script type="application/ld+json">{"@context":"https://schema.org"}</script>' +
      '<a href="https://example.org/referencias">Fonte</a>' +
      '<link rel="stylesheet" href="styles.css"/>'));
    expect(found).toEqual([]);
  });
  it('não trata hiperlinks HTTPS como recurso remoto embutido', () => {
    expect(check(xhtml('<a href="https://example.org">Leia mais</a>'))).toEqual([]);
    expect(check(xhtml('<a href="mailto:reader@example.org">Escrever</a>'))).toEqual([]);
  });
  it('identifica imagens remotas, stylesheet HTTPS e fontes em CSS como recurso remoto', () => {
    expect(contexts(check(xhtml('<img src="https://example.org/a.png"/>'))))
      .toContain('remote-resources');
    expect(contexts(check(xhtml('<link rel="stylesheet" href="https://example.org/a.css"/>'))))
      .toContain('remote-resources');
    expect(contexts(check('@font-face{src:url("https://example.org/font.woff2")}',
      'text/css'))).toContain('remote-resources');
  });
  it('URLs HTTPS legítimas são classificadas somente como metadado faltante', () => {
    const found = check('@import url(https://example.org/estilo.css);', 'text/css');
    expect(found).toHaveLength(1);
    expect(found[0]?.code).toBe('OPF_MANIFEST_PROPERTY_MISSING');
    expect(found[0]?.detail).toContain('não evidência de malware');
    expect(check('@import url(https://example.org/estilo.css);', 'text/css',
      ['remote-resources'])).toEqual([]);
  });
  it('comentários CSS e dados de scripts JSON não geram falso positivo', () => {
    expect(check('/* url(https://example.org/test.woff2) */p{color:blue}',
      'text/css')).toEqual([]);
    expect(check(xhtml('<script type="application/json">{"url":"https://example.org"}</script>')))
      .toEqual([]);
  });
  it('SVG isolado não precisa da propriedade svg, SVG incorporado precisa', () => {
    expect(contexts(check(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>',
      'image/svg+xml'))).not.toContain('svg');
    expect(contexts(check(xhtml('<svg:svg><svg:circle r="1"/></svg:svg>'))))
      .toContain('svg');
  });
  it('não impõe regras de EPUB3 a EPUB2', () => {
    expect(check(xhtml('<script>alert(1)</script>'), 'application/xhtml+xml', [],
      '2.0')).toEqual([]);
  });
});
