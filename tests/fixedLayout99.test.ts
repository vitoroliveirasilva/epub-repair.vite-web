// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';
import { validateFixedLayout } from '../src/epub/validation/validateFixedLayout';

const encoder = new TextEncoder();
const xhtml = (viewport: string) => '<html xmlns="http://www.w3.org/1999/xhtml">' +
  '<head>' + viewport + '</head><body><p>Página fixa</p></body></html>';
const svg = (viewBox: string) =>
  '<svg xmlns="http://www.w3.org/2000/svg" ' + viewBox + '><text>Olá</text></svg>';
function fixture(
  content: string,
  mediaType = 'application/xhtml+xml',
  layout = '<meta property="rendition:layout">pre-paginated</meta>',
  overrides = '',
) {
  const path = mediaType === 'image/svg+xml' ? 'OPS/page.svg' : 'OPS/page.xhtml';
  const opf = '<package xmlns="http://www.idpf.org/2007/opf" version="3.3">' +
    '<metadata>' + layout + '</metadata><manifest/>' +
    '<spine><itemref idref="page" ' + overrides + '/></spine></package>';
  const item = {
    id: 'page', href: path.split('/').at(-1) ?? '', mediaType,
    properties: [], pathSafe: true, exists: true, resolvedPath: path,
  };
  const loaded = { files: new Map([
    ['OPS/package.opf', { bytes: encoder.encode(opf) }],
    [path, { bytes: encoder.encode(content) }],
  ]) } as unknown as LoadedEpub;
  const pkg = {
    opfPath: 'OPS/package.opf', opfDir: 'OPS', version: '3.3',
    metadata: {}, rootfileCount: 1, manifest: [item],
    spine: [{ idref: 'page', manifestItem: item }],
  } as PackageDocumentInfo;
  return { loaded, pkg };
}
const codes = (entry: ReturnType<typeof fixture>) =>
  validateFixedLayout(entry.loaded, entry.pkg).map((issue) => issue.code);

describe('E-048: medidas obrigatórias de páginas fixed-layout', () => {
  it('aceita XHTML pre-paginated com altura e largura positivas', () => {
    const entry = fixture(xhtml('<meta name="viewport" content="width=1200, height=800"/>'));
    expect(codes(entry)).toEqual([]);
  });
  it('aponta viewport ausente ou com dimensões repetidas', () => {
    expect(codes(fixture(xhtml('')))).toContain('FIXED_LAYOUT_MISSING_VIEWPORT');
    expect(codes(fixture(xhtml(
      '<meta name="viewport" content="width=1200,width=1300,height=800"/>',
    ))).toContain('FIXED_LAYOUT_MISSING_VIEWPORT');
  });
  it('aceita SVG com viewBox; recusa geometria ausente', () => {
    expect(codes(fixture(svg('viewBox="0 0 800 600"'), 'image/svg+xml'))).toEqual([]);
    expect(codes(fixture(svg('width="800" height="600"'), 'image/svg+xml')))
      .toContain('FIXED_LAYOUT_INVALID_VIEWBOX');
  });
  it('não aplica viewport fixo ao EPUB reflowable e permite override por itemref', () => {
    const reflow = '<meta property="rendition:layout">reflowable</meta>';
    expect(codes(fixture(xhtml(''), 'application/xhtml+xml', reflow))).toEqual([]);
    expect(codes(fixture(xhtml(''), 'application/xhtml+xml', reflow,
      'properties="rendition:layout-pre-paginated"')))
      .toContain('FIXED_LAYOUT_MISSING_VIEWPORT');
  });
  it('sinaliza rendition:layout duplicado, sem tentar reescrever o OPF', () => {
    const duplicated = '<meta property="rendition:layout">pre-paginated</meta>'.repeat(2);
    expect(codes(fixture(xhtml(''), 'application/xhtml+xml', duplicated)))
      .toContain('FIXED_LAYOUT_INVALID_PROPERTY');
  });
});
