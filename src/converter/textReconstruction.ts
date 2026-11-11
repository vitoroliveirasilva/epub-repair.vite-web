import type {
  ConversionWarning,
  ConverterOptions,
  EditableSection,
  PdfLine,
  PdfPageAnalysis,
} from './model';

interface ReconstructedDocument {
  sections: EditableSection[];
  repeatedMarginLines: string[];
  warnings: ConversionWarning[];
}

interface Block {
  kind: 'heading' | 'paragraph' | 'footnote';
  text: string;
  sourcePages: number[];
  level?: 1 | 2 | undefined;
}

const PAGE_NUMBER = /^(?:p[aá]g(?:ina)?\.?\s*)?(?:\d{1,4}|[ivxlcdm]{1,10})(?:\s*(?:de|\/|of)\s*\d{1,4})?$/iu;
const CHAPTER_HEADING = /^(?:(?:cap[ií]tulo|chapter|parte|part|livro|book)\s+[\dIVXLCDM]+\b|pr[oó]logo\b|prologue\b|ep[ií]logo\b|epilogue\b|introdu[cç][aã]o\b|introduction\b|conclus[aã]o\b|conclusion\b)/iu;
const SENTENCE_END = /[.!?…:;”’»)]$/u;
const STRONG_SENTENCE_END = /[.!?…][”’»)]?$/u;
const LOWERCASE_START = /^\p{Ll}/u;
const LETTER = /\p{L}/u;

export function reconstructDocument(
  pages: PdfPageAnalysis[],
  options: ConverterOptions,
  documentTitle: string,
): ReconstructedDocument {
  const repeatedMarginLines = options.removeRepeatedMargins
    ? detectRepeatedMarginLines(pages)
    : [];
  const repeated = new Set(repeatedMarginLines.map(normalizeMarginKey));
  const warnings: ConversionWarning[] = [];
  const blocks: Block[] = [];

  for (const page of pages) {
    const ordered = orderLines(page.lines, page.width, page.columnCount);
    const filtered = ordered.filter((line) => {
      const text = normalizeSpaces(line.text);
      if (!text) return false;
      const margin = line.y > page.height * 0.88 || line.y < page.height * 0.12;
      if (margin && repeated.has(normalizeMarginKey(text))) return false;
      if (options.removePageNumbers && margin && PAGE_NUMBER.test(text)) return false;
      return true;
    });
    blocks.push(...linesToBlocks(filtered, page, options));
    if (page.columnCount > 1) {
      warnings.push({
        code: 'PDF_MULTIPLE_COLUMNS',
        title: 'Página com múltiplas colunas',
        detail: 'A ordem de leitura foi reorganizada automaticamente e merece conferência na prévia.',
        pageNumber: page.pageNumber,
        severity: 'warning',
      });
    }
    if (page.usedOcr && (page.ocrConfidence ?? 0) < 78) {
      warnings.push({
        code: 'PDF_OCR_LOW_CONFIDENCE',
        title: 'OCR com confiança reduzida',
        detail: 'Confira nomes próprios, pontuação e caracteres desta página antes de baixar o EPUB.',
        pageNumber: page.pageNumber,
        severity: 'warning',
      });
    }
  }

  const sections = splitIntoSections(mergePageBoundaries(blocks, options), documentTitle);
  if (sections.length === 1 && pages.length >= 12) {
    warnings.push({
      code: 'PDF_CHAPTERS_NOT_DETECTED',
      title: 'Capítulos não identificados com confiança',
      detail: 'O conteúdo foi preservado em uma seção única. Use o editor para conferir ou dividir a obra.',
      severity: 'info',
    });
  }
  if (repeatedMarginLines.length > 0) {
    warnings.push({
      code: 'PDF_REPEATED_MARGINS_REMOVED',
      title: 'Cabeçalhos ou rodapés repetidos removidos',
      detail: `${repeatedMarginLines.length} padrão(ões) recorrente(s) foi(ram) retirado(s) do texto ajustável.`,
      severity: 'info',
    });
  }
  return { sections, repeatedMarginLines, warnings };
}

export function detectColumnCount(lines: PdfLine[], pageWidth: number): number {
  const candidates = lines.filter((line) => line.text.length > 8 && line.width < pageWidth * 0.62);
  if (candidates.length < 10) return 1;
  const left = candidates.filter((line) => line.x < pageWidth * 0.42).length;
  const right = candidates.filter((line) => line.x > pageWidth * 0.48).length;
  const spanning = lines.filter((line) => line.width > pageWidth * 0.72).length;
  return left >= 5 && right >= 5 && spanning < candidates.length * 0.22 ? 2 : 1;
}

function detectRepeatedMarginLines(pages: PdfPageAnalysis[]): string[] {
  const occurrences = new Map<string, { count: number; sample: string }>();
  for (const page of pages) {
    const pageKeys = new Set<string>();
    for (const line of page.lines) {
      if (!(line.y > page.height * 0.88 || line.y < page.height * 0.12)) continue;
      const sample = normalizeSpaces(line.text);
      const key = normalizeMarginKey(sample);
      if (key.length < 3 || pageKeys.has(key) || PAGE_NUMBER.test(sample)) continue;
      pageKeys.add(key);
      const current = occurrences.get(key);
      occurrences.set(key, { count: (current?.count ?? 0) + 1, sample: current?.sample ?? sample });
    }
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.35));
  return [...occurrences.values()]
    .filter((entry) => entry.count >= threshold)
    .sort((a, b) => b.count - a.count)
    .map((entry) => entry.sample);
}

function orderLines(lines: PdfLine[], pageWidth: number, columnCount: number): PdfLine[] {
  if (columnCount < 2) return [...lines].sort(readingOrder);
  const left = lines.filter((line) => line.x < pageWidth * 0.48 || line.width > pageWidth * 0.7);
  const right = lines.filter((line) => line.x >= pageWidth * 0.48 && line.width <= pageWidth * 0.7);
  return [...left.sort(readingOrder), ...right.sort(readingOrder)];
}

function readingOrder(a: PdfLine, b: PdfLine): number {
  const vertical = b.y - a.y;
  return Math.abs(vertical) > Math.max(a.fontSize, b.fontSize) * 0.45 ? vertical : a.x - b.x;
}

function linesToBlocks(
  lines: PdfLine[],
  page: PdfPageAnalysis,
  options: ConverterOptions,
): Block[] {
  if (lines.length === 0) return [];
  const sizes = lines.map((line) => line.fontSize).filter((size) => size > 0).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] ?? 12;
  const blocks: Block[] = [];
  let paragraph = '';
  let previous: PdfLine | undefined;

  const flush = (): void => {
    const text = normalizeTypography(normalizeSpaces(paragraph), options.normalizeTypography);
    if (text) blocks.push({ kind: 'paragraph', text, sourcePages: [page.pageNumber] });
    paragraph = '';
  };

  for (const line of lines) {
    let text = normalizeSpaces(line.text);
    if (!text) continue;
    const short = text.length <= 140;
    const large = line.fontSize >= median * 1.24;
    const headingPattern = CHAPTER_HEADING.test(text);
    const heading = short && (headingPattern || large || looksLikeStandaloneHeading(text, line, page));
    const footnote = line.fontSize <= median * 0.78 && line.y < page.height * 0.32;

    if (heading) {
      flush();
      text = normalizeTypography(text, options.normalizeTypography);
      blocks.push({
        kind: 'heading',
        text,
        sourcePages: [page.pageNumber],
        level: headingPattern || line.fontSize >= median * 1.55 ? 1 : 2,
      });
      previous = line;
      continue;
    }

    if (footnote) {
      flush();
      blocks.push({
        kind: 'footnote',
        text: normalizeTypography(text, options.normalizeTypography),
        sourcePages: [page.pageNumber],
      });
      previous = line;
      continue;
    }

    const verticalGap = previous ? previous.y - line.y : 0;
    const paragraphGap = previous && verticalGap > Math.max(previous.fontSize, line.fontSize) * 2.05;
    const indented = previous && line.x - previous.x > median * 1.4;
    if (paragraph && (paragraphGap || (indented && SENTENCE_END.test(paragraph)))) flush();
    paragraph = joinLine(paragraph, text, options.dehyphenate);
    previous = line;
  }
  flush();
  return blocks;
}

function looksLikeStandaloneHeading(text: string, line: PdfLine, page: PdfPageAnalysis): boolean {
  const letters = [...text].filter((character) => LETTER.test(character));
  if (letters.length < 2) return false;
  const uppercase = letters.filter((character) => character === character.toLocaleUpperCase()).length;
  const mostlyUppercase = uppercase / letters.length > 0.82;
  const centered = Math.abs((line.x + line.width / 2) - page.width / 2) < page.width * 0.12;
  return text.length < 80 && centered && mostlyUppercase;
}

function joinLine(previous: string, next: string, dehyphenate: boolean): string {
  if (!previous) return next;
  if (dehyphenate && /\p{L}-$/u.test(previous) && LOWERCASE_START.test(next)) {
    return previous.slice(0, -1) + next;
  }
  return previous + ' ' + next;
}

function mergePageBoundaries(blocks: Block[], options: ConverterOptions): Block[] {
  const merged: Block[] = [];
  for (const block of blocks) {
    const previous = merged.at(-1);
    const previousPage = previous?.sourcePages.at(-1);
    const nextPage = block.sourcePages[0];
    const crossesPage = previousPage !== undefined && nextPage !== undefined && nextPage > previousPage;
    const joinsSentence = previous?.kind === 'paragraph' && block.kind === 'paragraph' && crossesPage &&
      (/(?<letter>\p{L})-$/u.test(previous.text) ||
        (!STRONG_SENTENCE_END.test(previous.text) && LOWERCASE_START.test(block.text)));
    if (previous && joinsSentence) {
      previous.text = joinLine(previous.text, block.text, options.dehyphenate);
      previous.sourcePages = [...new Set([...previous.sourcePages, ...block.sourcePages])];
    } else {
      merged.push({ ...block, sourcePages: [...block.sourcePages] });
    }
  }
  return merged;
}

function splitIntoSections(blocks: Block[], documentTitle: string): EditableSection[] {
  const sections: EditableSection[] = [];
  let title = documentTitle || 'Conteúdo';
  let current: Block[] = [];

  const flush = (): void => {
    if (current.length === 0) return;
    const sourcePages = [...new Set(current.flatMap((block) => block.sourcePages))];
    const html = current.map(blockToHtml).join('\n');
    const plainText = current.map((block) => block.text).join('\n\n');
    sections.push({
      id: `section-${String(sections.length + 1).padStart(3, '0')}`,
      title: title || `Seção ${sections.length + 1}`,
      html,
      plainText,
      sourcePages,
    });
    current = [];
  };

  for (const block of blocks) {
    if (block.kind === 'heading' && block.level === 1 && current.length > 0) {
      flush();
      title = block.text;
      current.push(block);
      continue;
    }
    if (block.kind === 'heading' && block.level === 1 && current.length === 0) title = block.text;
    current.push(block);
  }
  flush();
  if (sections.length === 0) {
    sections.push({
      id: 'section-001',
      title: documentTitle || 'Conteúdo',
      html: '<p>Nenhum texto pôde ser reconstruído automaticamente.</p>',
      plainText: 'Nenhum texto pôde ser reconstruído automaticamente.',
      sourcePages: [],
    });
  }
  return sections;
}

function blockToHtml(block: Block): string {
  const text = escapeXml(block.text);
  if (block.kind === 'heading') return `<h${block.level ?? 2}>${text}</h${block.level ?? 2}>`;
  if (block.kind === 'footnote') return `<aside class="footnote"><p>${text}</p></aside>`;
  return `<p>${text}</p>`;
}

function normalizeMarginKey(value: string): string {
  return normalizeSpaces(value)
    .toLocaleLowerCase()
    .replace(/\d+/gu, '#')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .trim();
}

function normalizeSpaces(value: string): string {
  return value.replace(/[\t\r\n\f ]+/gu, ' ').trim();
}

function normalizeTypography(value: string, enabled: boolean): string {
  if (!enabled) return value;
  return value
    .replace(/\.\.\./gu, '…')
    .replace(/\s+([,.;:!?])/gu, '$1')
    .replace(/([“‘«(])\s+/gu, '$1')
    .replace(/\s+([”’»)])/gu, '$1')
    .replace(/\u00a0/gu, ' ')
    .replace(/ {2,}/gu, ' ')
    .trim();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}
