import { describe, expect, it } from 'vitest';
import type { ManifestItem, PackageDocumentInfo } from '../src/epub/model/opfTypes';
import {
  buildCoverReportInfo,
  isProgressiveJpeg,
  normalizeLanguageTag,
  normalizeOpfDate,
} from '../src/epub/utils/kindleCompatibility';
import { PROGRESSIVE_JPEG_BYTES } from './helpers/syntheticEpub';

const coverItem: ManifestItem = {
  id: 'cover-image',
  href: 'Images/cover.jpg',
  mediaType: 'image/jpeg',
  properties: [],
  resolvedPath: 'OEBPS/Images/cover.jpg',
  pathSafe: true,
  exists: true,
};

const basePackage: PackageDocumentInfo = {
  opfPath: 'OEBPS/content.opf',
  opfDir: 'OEBPS',
  version: '2.0',
  metadata: {
    title: 'Fixture Kindle Safe',
    language: 'pt-BR',
    identifier: 'urn:uuid:epub-repair-fixture',
  },
  manifest: [coverItem],
  spine: [],
  coverMetaDeclared: false,
  rootfileCount: 1,
};

describe('Kindle compatibility helpers', () => {
  it('normalizes fragile OPF language and date values', () => {
    expect(normalizeLanguageTag('UND')).toBe('pt-BR');
    expect(normalizeLanguageTag('pt_br')).toBe('pt-BR');
    expect(normalizeOpfDate('2020/7/3')).toBe('2020-07-03');
  });

  it('detects progressive JPEG fixtures without decoding image pixels', () => {
    expect(isProgressiveJpeg(PROGRESSIVE_JPEG_BYTES)).toBe(true);
  });

  it('builds a safe cover report with a bounded preview data URL', () => {
    const cover = buildCoverReportInfo(
      basePackage,
      new Map([['OEBPS/Images/cover.jpg', { bytes: PROGRESSIVE_JPEG_BYTES }]]),
    );

    expect(cover.declared).toBe(false);
    expect(cover.exists).toBe(true);
    expect(cover.source).toBe('candidate');
    expect(cover.path).toBe('OEBPS/Images/cover.jpg');
    expect(cover.previewDataUrl).toMatch(/^data:image\/jpeg;base64,/u);
  });
});
