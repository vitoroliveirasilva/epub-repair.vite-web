import JSZip from 'jszip';
import { EPUB_MIME } from '../../src/epub/utils/constants';

export const PROGRESSIVE_JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc2, 0x00, 0x11, 0x08, 0x03, 0x84, 0x02, 0x58, 0x03, 0x01, 0x11, 0x00, 0x02,
  0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
]);

export async function buildKindleIssueEpub(): Promise<Uint8Array> {
  const zip = new JSZip();

  zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
  zip.file('META-INF/container.xml', containerXml());
  zip.file('OEBPS/content.opf', opfXml());
  zip.file('OEBPS/toc.ncx', ncxXml());
  zip.file('OEBPS/Text/chapter1.xhtml', xhtmlWithKindleIssues('Capítulo 1'));
  zip.file('OEBPS/Text/chapter2.xhtml', xhtmlWithKindleIssues('Capítulo 2'));
  zip.file('OEBPS/Images/cover.jpg', PROGRESSIVE_JPEG_BYTES);

  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return new Uint8Array(bytes);
}

function containerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`;
}

function opfXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="1.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Fixture Kindle Safe</dc:title>
    <dc:language>UND</dc:language>
    <dc:identifier id="bookid">urn:uuid:epub-repair-fixture</dc:identifier>
    <dc:date>2020/7/3</dc:date>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
    <item id="chapter1" href="Text/chapter1.xhtml" media-type="application/xhtml+xml" />
    <item id="chapter2" href="Text/chapter2.xhtml" media-type="application/xhtml+xml" />
    <item id="cover-image" href="Images/cover.jpg" media-type="image/jpeg" />
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter1" />
    <itemref idref="chapter2" />
  </spine>
</package>`;
}

function ncxXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:epub-repair-fixture" />
  </head>
  <docTitle><text>Fixture Kindle Safe</text></docTitle>
  <navMap>
    <navPoint id="nav-1" playOrder="2">
      <navLabel><text>Capítulo 1</text></navLabel>
      <content src="Text/chapter1.xhtml" />
    </navPoint>
    <navPoint id="nav-2" playOrder="2">
      <navLabel><text>Apêndice ausente</text></navLabel>
      <content src="Text/missing.xhtml" />
    </navPoint>
    <navPoint id="nav-3" playOrder="1">
      <navLabel><text>Capítulo 1 duplicado</text></navLabel>
      <content src="Text/chapter1.xhtml" />
    </navPoint>
  </navMap>
</ncx>`;
}

function xhtmlWithKindleIssues(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="" xml:lang="">
  <head>
    <title>${title}</title>
    <meta http-equiv="Content-Type" content="text/html; charset=windows-1252; extra=legacy" />
  </head>
  <body>
    <h1>${title}</h1>
    <p>Texto com entidade frágil&nbsp;para fixture.</p>
    <img src="../Images/cover.jpg" alt="Capa" />
  </body>
</html>`;
}
