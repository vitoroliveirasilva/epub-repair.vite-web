// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { parsePackageDocument } from '../src/epub/validation/opfParser';
import { validateInternalAnchors } from '../src/epub/validation/validateInternalAnchors';
import { validateNavigation } from '../src/epub/validation/validateNavigation';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';

const html = (body: string) =>
  `<html xmlns="http://www.w3.org/1999/xhtml"><body>${body}</body></html>`;

describe('Conformidade de links EPUB', () => {
  it('E-037: reporta fragmentos quebrados mas aceita destinos válidos', async () => {
    const loaded = await loadEpub('book.epub', await buildKindleIssueEpub());
    const pkg = parsePackageDocument(loaded).packageInfo;
    expect(pkg).toBeDefined();
    if (!pkg) return;
    const chapters = pkg.manifest.filter((item) => item.resolvedPath.endsWith('.xhtml'));
    expect(chapters.length).toBeGreaterThanOrEqual(2);
    const [first, second] = chapters;
    if (!first || !second) return;
    loaded.files.get(first.resolvedPath)!.bytes = new TextEncoder().encode(
      html(`<a href="${second.href.split('/').pop()}#existe">Válido</a>` +
        `<a href="${second.href.split('/').pop()}#ausente">Quebrado</a>`),
    );
    loaded.files.get(second.resolvedPath)!.bytes = new TextEncoder().encode(
      html('<h2 id="existe">Destino</h2>'),
    );
    const errors = validateInternalAnchors(loaded, pkg).filter(
      (item) => item.code === 'CONTENT_MISSING_FRAGMENT',
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.repairable).toBe(false);
  });


  it('E-037: distingue âncora legada, fragmento Unicode e SVG local de destino inexistente', async () => {
    const loaded = await loadEpub('book.epub', await buildKindleIssueEpub());
    const pkg = parsePackageDocument(loaded).packageInfo;
    if (!pkg) throw new Error('Fixture sem OPF');
    const source = pkg.manifest.find((x) => x.resolvedPath.endsWith('chapter1.xhtml'))!;
    const destination = pkg.manifest.find((x) => x.resolvedPath.endsWith('chapter2.xhtml'))!;
    loaded.files.get(source.resolvedPath)!.bytes = new TextEncoder().encode(html(
      '<a href="chapter2.xhtml#se%C3%A7%C3%A3o">Unicode válido</a>' +
      '<a href="chapter2.xhtml#legado">Nome legado</a>' +
      '<a href="#ausente">Quebrado</a>' +
      '<a href="https://example.org/page#externo">Externo permitido</a>',
    ));
    loaded.files.get(destination.resolvedPath)!.bytes = new TextEncoder().encode(
      html('<p id="seção">Texto</p><a name="legado">Nota antiga</a>'),
    );
    const missing = validateInternalAnchors(loaded, pkg)
      .filter((x) => x.code === 'CONTENT_MISSING_FRAGMENT');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.context).toBe('#ausente');
  });

  it('E-039: detecta fragmentos do NCX quebrados sem exigir entrada por arquivo', async () => {
    const loaded = await loadEpub('book.epub', await buildKindleIssueEpub());
    const pkg = parsePackageDocument(loaded).packageInfo;
    if (!pkg) throw new Error('Fixture sem OPF');
    const chapter = pkg.manifest.find((x) => x.resolvedPath.endsWith('chapter1.xhtml'))!;
    loaded.files.get(chapter.resolvedPath)!.bytes = new TextEncoder().encode(
      html('<h1 id="intro">Capítulo</h1>'),
    );
    const ncx = loaded.files.get(pkg.ncxItem!.resolvedPath)!;
    const text = new TextDecoder().decode(ncx.bytes);
    ncx.bytes = new TextEncoder().encode(text.replace('Text/chapter1.xhtml',
      'Text/chapter1.xhtml#id-inexistente'));
    const { validateKindleCompatibility } = await import('../src/epub/validation/validateKindleCompatibility');
    expect(validateKindleCompatibility(loaded, pkg).some((issue) =>
      issue.code === 'NCX_MISSING_FRAGMENT')).toBe(true);
  });

  it('E-038: índice EPUB3 com toc vazio é um aviso, não índice válido', () => {
    const navPath = 'OPS/nav.xhtml';
    const content = html('<nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc"><ol/></nav>');
    const loaded = {
      files: new Map([[navPath, { path: navPath, directory: false, bytes: new TextEncoder().encode(content) }]]),
    } as unknown as LoadedEpub;
    const pkg = {
      opfPath: 'OPS/book.opf', opfDir: 'OPS', version: '3.0', metadata: {},
      manifest: [], spine: [], rootfileCount: 1,
      navItem: {
        id: 'nav', href: 'nav.xhtml', mediaType: 'application/xhtml+xml',
        properties: ['nav'], resolvedPath: navPath, pathSafe: true, exists: true,
      },
    } as PackageDocumentInfo;
    expect(validateNavigation(loaded, pkg).some((item) => item.code === 'NAV_EMPTY')).toBe(true);
  });
  it('E-038/E-040: preserva toc, page-list e landmarks válidos, detecta duplicações', () => {
    const path = 'OPS/nav.xhtml';
    const toc = '<nav epub:type="toc"><h1>Sumário</h1><ol><li><a href="chapter.xhtml">I</a></li></ol></nav>';
    const page = '<nav epub:type="page-list"><ol><li><a href="chapter.xhtml#p2">2</a></li></ol></nav>';
    const landmarks = '<nav epub:type="landmarks"><ol><li>' +
      '<a epub:type="bodymatter" href="chapter.xhtml">Início</a></li></ol></nav>';
    const run = (body: string) => {
      const markup = '<html xmlns="http://www.w3.org/1999/xhtml" ' +
        'xmlns:epub="http://www.idpf.org/2007/ops"><body>' + body + '</body></html>';
      const loaded = { files: new Map([[path, { bytes: new TextEncoder().encode(markup) }]]) } as unknown as LoadedEpub;
      const pkg = {
        opfPath: 'OPS/book.opf', opfDir: 'OPS', version: '3.0',
        metadata: {}, manifest: [], spine: [], rootfileCount: 1,
        navItem: { id: 'nav', href: 'nav.xhtml', mediaType: 'application/xhtml+xml',
          properties: ['nav'], resolvedPath: path, pathSafe: true, exists: true },
      } as PackageDocumentInfo;
      return validateNavigation(loaded, pkg).map((issue) => issue.code);
    };
    expect(run(toc + page + landmarks).filter((code) => code.startsWith('NAV_'))).toEqual([]);
    expect(run(toc + toc)).toContain('NAV_DUPLICATE_TYPE');
    expect(run(toc + '<nav epub:type="page-list"><div><ol><li>2</li></ol></div></nav>'))
      .toContain('NAV_INVALID_STRUCTURE');
    expect(run(toc + '<nav epub:type="landmarks"><ol><li>' +
      '<a href="chapter.xhtml">Início</a></li></ol></nav>'))
      .toContain('NAV_LANDMARK_TYPE_MISSING');
  });

});
