import JSZip from 'jszip';
import {
  canRepairReport,
  DEFAULT_REPAIR_OPTIONS,
  inspectEpub,
  repairEpub,
} from '../epub';
import type {
  ConversionLayout,
  ConversionResult,
  ConverterOptions,
  EditableSection,
  PdfAnalysisResult,
} from './model';
import { renderPdfPages } from './pdfEngine';

interface BuildEpubInput {
  sourceBytes: Uint8Array;
  analysis: PdfAnalysisResult;
  sections: EditableSection[];
  title: string;
  author: string;
  options: ConverterOptions;
  signal?: AbortSignal | undefined;
  onProgress?: ((phase: string, completed?: number, total?: number) => void) | undefined;
}

export async function buildEpubFromPdf(input: BuildEpubInput): Promise<ConversionResult> {
  throwIfAborted(input.signal);
  const layout = resolveLayout(input.options.outputLayout, input.analysis.suggestedLayout);
  const identifier = `urn:uuid:${crypto.randomUUID()}`;
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
  const title = input.title.trim() || input.analysis.title || 'Documento convertido';
  const author = input.author.trim();
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', containerXml());
  input.onProgress?.('Montando estrutura EPUB');

  if (layout === 'fixed') {
    await addFixedLayout(zip, input, title, author, identifier, modified);
  } else {
    addReflowableLayout(zip, input, title, author, identifier, modified);
  }

  throwIfAborted(input.signal);
  input.onProgress?.('Compactando EPUB');
  const initialBytes = await zip.generateAsync({
    type: 'uint8array',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  throwIfAborted(input.signal);
  const fileName = `${safeFileName(title)}.epub`;
  let finalBytes = new Uint8Array(initialBytes);
  let validation = await inspectEpub(fileName, finalBytes);
  if (validation.stats.fatalCount > 0) {
    const failures = validation.issues
      .filter((issue) => issue.severity === 'fatal')
      .map((issue) => `${issue.code}: ${issue.detail}`)
      .join(', ');
    throw new Error(`O EPUB gerado não passou pela validação estrutural e não será disponibilizado${failures ? `: ${failures}` : '.'}`);
  }
  if (canRepairReport(validation)) {
    input.onProgress?.('Aplicando validação e acabamento final');
    const repaired = await repairEpub(
      fileName,
      finalBytes,
      DEFAULT_REPAIR_OPTIONS,
      'repair',
      undefined,
      input.signal,
    );
    if (repaired.changed && repaired.blob) {
      finalBytes = new Uint8Array(await repaired.blob.arrayBuffer());
      validation = repaired.after;
    }
  }
  if (validation.stats.fatalCount > 0 || validation.stats.errorCount > 0) {
    throw new Error('O acabamento automático ainda encontrou erros no EPUB gerado. Revise o PDF antes de tentar novamente.');
  }
  const blob = new Blob([finalBytes], { type: 'application/epub+zip' });
  return {
    fileName,
    blob,
    bytes: finalBytes,
    layout,
    validation,
    warnings: input.analysis.warnings,
  };
}

function addReflowableLayout(
  zip: JSZip,
  input: BuildEpubInput,
  title: string,
  author: string,
  identifier: string,
  modified: string,
): void {
  const sections = input.sections.length > 0 ? input.sections : input.analysis.sections;
  const cover = dataUrlToBytes(input.analysis.pages[0]?.previewDataUrl);
  if (cover) zip.file('OEBPS/Images/cover.jpg', cover);
  zip.file('OEBPS/Styles/book.css', reflowableCss());
  if (cover) zip.file('OEBPS/Text/cover.xhtml', coverXhtml(title, input.options.language));
  for (const [index, section] of sections.entries()) {
    zip.file(`OEBPS/Text/section-${String(index + 1).padStart(3, '0')}.xhtml`,
      sectionXhtml(section, title, input.options.language));
  }
  zip.file('OEBPS/nav.xhtml', navXhtml(
    title,
    input.options.language,
    sections.map((section, index) => ({
      title: section.title || `Seção ${index + 1}`,
      href: `Text/section-${String(index + 1).padStart(3, '0')}.xhtml`,
    })),
    cover ? 'Text/cover.xhtml' : undefined,
  ));
  zip.file('OEBPS/content.opf', reflowableOpf({
    title,
    author,
    language: input.options.language,
    identifier,
    modified,
    sections,
    hasCover: Boolean(cover),
  }));
}

async function addFixedLayout(
  zip: JSZip,
  input: BuildEpubInput,
  title: string,
  author: string,
  identifier: string,
  modified: string,
): Promise<void> {
  const pages: Array<{ width: number; height: number }> = [];
  zip.file('OEBPS/Styles/fixed.css', fixedCss());
  await renderPdfPages(input.sourceBytes, input.signal,
    (pageNumber, pageCount, image, width, height) => {
      throwIfAborted(input.signal);
      pages.push({ width, height });
      const number = String(pageNumber).padStart(4, '0');
      zip.file(`OEBPS/Images/page-${number}.jpg`, image);
      zip.file(`OEBPS/Text/page-${number}.xhtml`, fixedPageXhtml(
        pageNumber, width, height, title, input.options.language));
      input.onProgress?.(`Renderizando página ${pageNumber} de ${pageCount}`, pageNumber, pageCount);
      return Promise.resolve();
    });
  const tocEntries = input.sections.map((section, index) => ({
    title: section.title || `Seção ${index + 1}`,
    href: `Text/page-${String(section.sourcePages[0] ?? 1).padStart(4, '0')}.xhtml`,
  }));
  zip.file('OEBPS/nav.xhtml', navXhtml(
    title,
    input.options.language,
    tocEntries.length > 0 ? tocEntries : [{ title: 'Início', href: 'Text/page-0001.xhtml' }],
    'Text/page-0001.xhtml',
    pages.length,
  ));
  zip.file('OEBPS/content.opf', fixedOpf({
    title,
    author,
    language: input.options.language,
    identifier,
    modified,
    pageCount: pages.length,
  }));
}

function reflowableOpf(input: {
  title: string;
  author: string;
  language: string;
  identifier: string;
  modified: string;
  sections: EditableSection[];
  hasCover: boolean;
}): string {
  const manifestSections = input.sections.map((_, index) =>
    `<item id="section-${index + 1}" href="Text/section-${String(index + 1).padStart(3, '0')}.xhtml" media-type="application/xhtml+xml"/>`).join('\n    ');
  const spineSections = input.sections.map((_, index) =>
    `<itemref idref="section-${index + 1}"/>`).join('\n    ');
  return xml(`
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" prefix="rendition: http://www.idpf.org/vocab/rendition/#">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(input.identifier)}</dc:identifier>
    <dc:title>${escapeXml(input.title)}</dc:title>
    ${input.author ? `<dc:creator>${escapeXml(input.author)}</dc:creator>` : ''}
    <dc:language>${escapeXml(input.language)}</dc:language>
    <meta property="dcterms:modified">${input.modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="Styles/book.css" media-type="text/css"/>
    ${input.hasCover ? '<item id="cover-image" href="Images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>\n    <item id="cover-page" href="Text/cover.xhtml" media-type="application/xhtml+xml"/>' : ''}
    ${manifestSections}
  </manifest>
  <spine>
    ${input.hasCover ? '<itemref idref="cover-page" linear="no"/>' : ''}
    ${spineSections}
  </spine>
</package>`);
}

function fixedOpf(input: {
  title: string;
  author: string;
  language: string;
  identifier: string;
  modified: string;
  pageCount: number;
}): string {
  const images = Array.from({ length: input.pageCount }, (_, index) => {
    const number = String(index + 1).padStart(4, '0');
    const cover = index === 0 ? ' properties="cover-image"' : '';
    return `<item id="image-${index + 1}" href="Images/page-${number}.jpg" media-type="image/jpeg"${cover}/>`;
  }).join('\n    ');
  const pages = Array.from({ length: input.pageCount }, (_, index) => {
    const number = String(index + 1).padStart(4, '0');
    return `<item id="page-${index + 1}" href="Text/page-${number}.xhtml" media-type="application/xhtml+xml"/>`;
  }).join('\n    ');
  const spine = Array.from({ length: input.pageCount }, (_, index) =>
    `<itemref idref="page-${index + 1}"/>`).join('\n    ');
  return xml(`
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" prefix="rendition: http://www.idpf.org/vocab/rendition/#">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(input.identifier)}</dc:identifier>
    <dc:title>${escapeXml(input.title)}</dc:title>
    ${input.author ? `<dc:creator>${escapeXml(input.author)}</dc:creator>` : ''}
    <dc:language>${escapeXml(input.language)}</dc:language>
    <meta property="dcterms:modified">${input.modified}</meta>
    <meta property="rendition:layout">pre-paginated</meta>
    <meta property="rendition:orientation">auto</meta>
    <meta property="rendition:spread">auto</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="Styles/fixed.css" media-type="text/css"/>
    ${images}
    ${pages}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`);
}

function sectionXhtml(section: EditableSection, bookTitle: string, language: string): string {
  return xhtml(language, section.title || bookTitle,
    `<main epub:type="bodymatter">${section.html}</main>`, '../Styles/book.css');
}

function coverXhtml(title: string, language: string): string {
  return xhtml(language, `Capa — ${title}`,
    `<main class="cover" epub:type="cover"><img src="../Images/cover.jpg" alt="Capa de ${escapeXml(title)}"/></main>`,
    '../Styles/book.css');
}

function fixedPageXhtml(
  pageNumber: number,
  width: number,
  height: number,
  title: string,
  language: string,
): string {
  const number = String(pageNumber).padStart(4, '0');
  return xml(`
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${language}" xml:lang="${language}">
  <head>
    <title>${escapeXml(title)} — página ${pageNumber}</title>
    <meta name="viewport" content="width=${width},height=${height}"/>
    <link rel="stylesheet" type="text/css" href="../Styles/fixed.css"/>
  </head>
  <body><main class="fixed-page"><img src="../Images/page-${number}.jpg" alt="Página ${pageNumber}"/></main></body>
</html>`);
}

function navXhtml(
  title: string,
  language: string,
  entries: Array<{ title: string; href: string }>,
  coverHref?: string,
  pageCount?: number,
): string {
  const toc = entries.map((entry) =>
    `<li><a href="${escapeXml(entry.href)}">${escapeXml(entry.title)}</a></li>`).join('\n        ');
  const landmarks = coverHref
    ? `<nav epub:type="landmarks" aria-label="Pontos de referência"><ol><li><a epub:type="cover" href="${coverHref}">Capa</a></li></ol></nav>`
    : '';
  const pageList = pageCount
    ? `<nav epub:type="page-list" aria-label="Páginas"><ol>${Array.from({ length: pageCount }, (_, index) => `<li><a href="Text/page-${String(index + 1).padStart(4, '0')}.xhtml">${index + 1}</a></li>`).join('')}</ol></nav>`
    : '';
  return xml(`
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${language}" xml:lang="${language}">
  <head><title>Índice — ${escapeXml(title)}</title></head>
  <body>
    <nav epub:type="toc" aria-label="Índice"><h1>Índice</h1><ol>${toc}</ol></nav>
    ${landmarks}
    ${pageList}
  </body>
</html>`);
}

function xhtml(language: string, title: string, body: string, css: string): string {
  return xml(`
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${language}" xml:lang="${language}">
  <head><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="${css}"/></head>
  <body>${body}</body>
</html>`);
}

function containerXml(): string {
  return xml(`
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);
}

function reflowableCss(): string {
  return `html { color: #181818; background: #fff; }
body { margin: 5%; font-family: Georgia, serif; line-height: 1.55; }
main { max-width: 44rem; margin: 0 auto; }
h1 { margin: 2.8em 0 1.4em; font-size: 1.75em; text-align: center; page-break-before: always; }
h2 { margin: 2em 0 1em; font-size: 1.35em; }
p { margin: 0; text-align: justify; text-indent: 1.25em; orphans: 2; widows: 2; }
h1 + p, h2 + p, aside + p { text-indent: 0; }
.footnote { margin: 1.5em 0; padding-top: .75em; border-top: 1px solid #888; font-size: .85em; }
.footnote p { text-indent: 0; }
.cover { display: grid; min-height: 90vh; place-items: center; }
.cover img { display: block; width: auto; max-width: 100%; max-height: 90vh; margin: auto; }`;
}

function fixedCss(): string {
  return `html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: #fff; }
.fixed-page { width: 100%; height: 100%; margin: 0; }
.fixed-page img { display: block; width: 100%; height: 100%; margin: 0; object-fit: fill; }`;
}

function dataUrlToBytes(dataUrl: string | undefined): Uint8Array | undefined {
  if (!dataUrl) return undefined;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return undefined;
  const binary = atob(dataUrl.slice(comma + 1));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function resolveLayout(requested: ConverterOptions['outputLayout'], suggested: ConversionLayout): ConversionLayout {
  return requested === 'auto' ? suggested : requested;
}

function safeFileName(value: string): string {
  return stripControlCharacters(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[<>:"/\\|?*]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 120) || 'documento-convertido';
}

function stripControlCharacters(value: string): string {
  return Array.from(value, (character) => character.charCodeAt(0) < 32 ? '-' : character).join('');
}

function xml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>${body.trimStart()}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
}
