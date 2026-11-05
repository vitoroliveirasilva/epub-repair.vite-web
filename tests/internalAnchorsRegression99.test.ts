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
});
