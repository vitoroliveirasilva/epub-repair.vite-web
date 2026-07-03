import { describe, expect, it } from 'vitest';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { EPUB_MIME } from '../src/epub/utils/constants';
import { isProgressiveJpeg } from '../src/epub/utils/kindleCompatibility';
import { buildKindleIssueEpub, PROGRESSIVE_JPEG_BYTES } from './helpers/syntheticEpub';

const decoder = new TextDecoder('utf-8', { fatal: false });

describe('synthetic EPUB fixtures', () => {
  it('builds a loadable EPUB fixture with deterministic Kindle Safe issues', async () => {
    const loaded = await loadEpub('kindle-issue-fixture.epub', await buildKindleIssueEpub());

    expect(loaded.validZip).toBe(true);
    expect(loaded.files.has('mimetype')).toBe(true);
    expect(loaded.files.has('META-INF/container.xml')).toBe(true);
    expect(loaded.files.has('OEBPS/content.opf')).toBe(true);
    expect(loaded.files.has('OEBPS/toc.ncx')).toBe(true);
    expect(loaded.files.has('OEBPS/Text/chapter1.xhtml')).toBe(true);
    expect(loaded.files.has('OEBPS/Text/chapter2.xhtml')).toBe(true);
    expect(loaded.files.has('OEBPS/Images/cover.jpg')).toBe(true);
  });

  it('keeps fixture markers for OPF, NCX, XHTML and image regressions', async () => {
    const loaded = await loadEpub('kindle-issue-fixture.epub', await buildKindleIssueEpub());
    const mimetype = loaded.files.get('mimetype');
    const opf = loaded.files.get('OEBPS/content.opf');
    const ncx = loaded.files.get('OEBPS/toc.ncx');
    const chapter = loaded.files.get('OEBPS/Text/chapter1.xhtml');

    if (!mimetype || !opf || !ncx || !chapter) throw new Error('Fixture EPUB incompleto.');

    expect(decoder.decode(mimetype.bytes)).toBe(EPUB_MIME);
    expect(decoder.decode(opf.bytes)).toContain('version="1.0"');
    expect(decoder.decode(opf.bytes)).toContain('<dc:language>UND</dc:language>');
    expect(decoder.decode(opf.bytes)).toContain('<dc:date>2020/7/3</dc:date>');
    expect(decoder.decode(opf.bytes)).not.toContain('name="cover"');
    expect(decoder.decode(ncx.bytes)).toContain('playOrder="2"');
    expect(decoder.decode(ncx.bytes)).toContain('Text/missing.xhtml');
    expect(decoder.decode(chapter.bytes)).toContain('&nbsp;');
    expect(decoder.decode(chapter.bytes)).toContain('lang=""');
    expect(decoder.decode(chapter.bytes)).toContain('extra=legacy');
    expect(isProgressiveJpeg(PROGRESSIVE_JPEG_BYTES)).toBe(true);
  });
});
