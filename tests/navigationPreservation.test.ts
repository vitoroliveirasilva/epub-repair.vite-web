import { describe, expect, it } from 'vitest';
import { shouldCreateNav, shouldCreateNcx } from '../src/epub/repair/repairNavigation';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const basePackage: PackageDocumentInfo = {
  opfPath: 'OPS/content.opf',
  opfDir: 'OPS',
  version: '3.0',
  metadata: {},
  manifest: [],
  spine: [],
  rootfileCount: 1,
};

describe('navigation repair rules', () => {
  it('não recria nav quando EPUB 3 já tem nav existente', () => {
    expect(
      shouldCreateNav({
        ...basePackage,
        navItem: {
          id: 'nav',
          href: 'nav.xhtml',
          mediaType: 'application/xhtml+xml',
          properties: ['nav'],
          resolvedPath: 'OPS/nav.xhtml',
          exists: true,
        },
      }),
    ).toBe(false);
  });

  it('gera NCX para EPUB 2', () => {
    expect(shouldCreateNcx({ ...basePackage, version: '2.0' })).toBe(true);
  });

  it('não gera NCX para EPUB 3 quando não foi declarado ausente', () => {
    expect(shouldCreateNcx(basePackage)).toBe(false);
  });
});
