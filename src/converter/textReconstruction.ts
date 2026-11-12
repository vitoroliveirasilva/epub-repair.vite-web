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
  kind: 'heading' | 'paragraph' | 'footnote' | 'figure';
  figureId?: string | undefined;
  text: string;
  sourcePages: number[];
  level?: 1 | 2 | undefined;
}

const PAGE_NUMBER = /^(?:p[aá]g(?:ina)?\.?\s*)?(?:\d{1,4}|[ivxlcdm]{1,10})(?:\s*(?:de|\/|of)\s*\d{1,4})?$/iu;
const CHAPTER_HEADING = /^(?:(?:cap[ií]tulo|chapter|parte|part|livro|book)\s+[\dIVXLCDM]+\b|(?:pr[oó]logo|prologue|ep[ií]logo|epilogue|introdu[cç][aã]o|introduction|conclus[aã]o|conclusion|agradecimentos?|acknowledg(?:e)?ments?|dedicat[oó]ria|dedication|posf[aá]cio|afterword|sobre\s+(?:a|o)\s+autor(?:a)?|about\s+the\s+author|cr[eé]ditos?|bibliografia|notas?)\s*)$/iu;
const SENTENCE_END = /[.!?…:;”’»)]$/u;
const STRONG_SENTENCE_END = /[.!?…][”’»)]?$/u;
const LOWERCASE_START = /^\p{Ll}/u;
const LETTER = /\p{L}/u;
const CHAPTER_NUMBER = /^\s*(\d{1,3})[.)]?(?:\s+|$)/u;
const EDITORIAL_HEADING = /^(?:sum[aá]rio|contents|pref[aá]cio(?:\s+.+)?|foreword|apêndice|appendix|[ií]ndice(?:\s+remissivo)?|index)$/iu;
const SENTENCE_LIKE = /(?:[,;:]|\b(?:que|de|da|do|das|dos|para|por|com|como|e|ou|the|of|to|and|with)\s*)$/iu;
const CATALOG_ENTRY = /^(?:CDD|CDU|ISBN(?:-1[03])?|ISSN|DOI)\s*[:.-]?\s*[\dXx./-]+(?:\s.*)?$/iu;

export function reconstructDocument(
  pages: PdfPageAnalysis[],
  options: ConverterOptions,
  documentTitle: string,
): ReconstructedDocument {
  const trailingNavigationStart = detectTrailingNavigationStart(pages);
  const contentPages = trailingNavigationStart >= 0 ? pages.slice(0, trailingNavigationStart) : pages;
  const repeatedMarginLines = options.removeRepeatedMargins
    ? detectRepeatedMarginLines(contentPages)
    : [];
  const repeated = new Set(repeatedMarginLines.map(normalizeMarginKey));
  const warnings: ConversionWarning[] = [];
  const blocks: Block[] = [];
  const tocHeadings = extractTocHeadings(contentPages);

  for (const page of contentPages) {
    const ordered = orderLines(page.lines, page.width, page.columnCount);
    const filtered = ordered.filter((line) => {
      const text = normalizeSpaces(line.text);
      if (!text) return false;
      const margin = line.y > page.height * 0.88 || line.y < page.height * 0.12;
      if (margin && repeated.has(normalizeMarginKey(text))) return false;
      const paginationMargin = line.y > page.height * 0.96 || line.y < page.height * 0.06;
      if (options.removePageNumbers && paginationMargin && PAGE_NUMBER.test(text)) return false;
      return true;
    });
    const tocPage = isTocPage(page);
    const pageHeadings = tocPage ? new Map<number, string>() : tocHeadings;
    const prepared = collapseKnownHeadings(filtered, pageHeadings);
    blocks.push(...linesToBlocks(prepared, page, options, pageHeadings, tocPage));
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
        title: 'Texto da imagem reconhecido com confiança reduzida',
        detail: 'Confira nomes próprios, pontuação e caracteres desta página antes de baixar o EPUB.',
        pageNumber: page.pageNumber,
        severity: 'warning',
      });
    }
  }

  const sections = splitIntoSections(
    splitLongParagraphs(mergePageBoundaries(blocks, options)),
    documentTitle,
  );
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
  if (trailingNavigationStart >= 0) {
    warnings.push({
      code: 'PDF_TRAILING_NAVIGATION_REMOVED',
      title: 'Lista técnica de páginas removida',
      detail: `${pages.length - trailingNavigationStart} página(s) de navegação exportada pelo gerador do PDF foram retiradas para não duplicar o sumário no EPUB.`,
      severity: 'info',
    });
  }
  const headingCount = sections.reduce((total, section) =>
    total + (section.html.match(/<h[12]>/gu)?.length ?? 0), 0);
  if (headingCount > Math.max(40, sections.length * 12)) {
    warnings.push({
      code: 'PDF_HEADING_REVIEW_REQUIRED',
      title: 'Hierarquia de títulos precisa de conferência',
      detail: `${headingCount} título(s) foram identificados. A conversão preservou o texto, mas recomenda revisar a hierarquia antes de baixar.`,
      severity: 'warning',
    });
  }
  return { sections, repeatedMarginLines, warnings };
}

function detectTrailingNavigationStart(pages: PdfPageAnalysis[]): number {
  const threshold = Math.floor(pages.length * 0.65);
  return pages.findIndex((page, index) => {
    if (index < threshold) return false;
    const lines = page.lines.map((line) => normalizeSpaces(line.text));
    const chapterEntries = lines.filter((line) => /^\d{1,3}[.)]\s+\p{L}/u.test(line)).length;
    return lines.some((line) => /^sum[aá]rio$/iu.test(line)) &&
      lines.some((line) => /^lista\s+de\s+p[aá]ginas$/iu.test(line)) && chapterEntries >= 4;
  });
}

function extractTocHeadings(pages: PdfPageAnalysis[]): Map<number, string> {
  const headings = new Map<number, string>();
  for (const page of pages.slice(0, Math.min(40, pages.length))) {
    const lines = orderLines(page.lines, page.width, page.columnCount)
      .map((line) => normalizeSpaces(line.text))
      .filter(Boolean);
    if (!lines.some((line) => /^(?:sum[aá]rio|contents)$/iu.test(line))) continue;
    for (let index = 0; index < lines.length; index += 1) {
      const match = lines[index]!.match(CHAPTER_NUMBER);
      if (!match) continue;
      const ordinal = Number(match[1]);
      if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 150) continue;
      const initial = lines[index]!.replace(CHAPTER_NUMBER, '').trim();
      const pieces = initial ? [initial] : [];
      for (let cursor = index + 1; cursor < lines.length && pieces.length < 3; cursor += 1) {
        const candidate = lines[cursor]!;
        if (CHAPTER_NUMBER.test(candidate) || EDITORIAL_HEADING.test(candidate)) break;
        pieces.push(candidate);
        if (STRONG_SENTENCE_END.test(candidate)) break;
      }
      const title = normalizeSpaces(pieces.join(' '));
      if (title.length >= 4 && title.length <= 220) headings.set(ordinal, title);
    }
    if (headings.size >= 3) return headings;
    headings.clear();
  }
  return headings;
}

function isTocPage(page: PdfPageAnalysis): boolean {
  return page.lines.some((line) => /^(?:sum[aá]rio|contents)$/iu.test(normalizeSpaces(line.text))) &&
    page.lines.filter((line) => CHAPTER_NUMBER.test(normalizeSpaces(line.text))).length >= 3;
}

function collapseKnownHeadings(lines: PdfLine[], headings: Map<number, string>): PdfLine[] {
  if (headings.size === 0) return lines;
  const output: PdfLine[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const ordinalMatch = normalizeSpaces(line.text).match(/^\s*(\d{1,3})[.)]?\s*$/u);
    if (ordinalMatch) {
      const ordinal = Number(ordinalMatch[1]);
      const expected = headings.get(ordinal);
      if (expected) {
        for (let length = 1; length <= 3 && index + length < lines.length; length += 1) {
          const candidates = lines.slice(index + 1, index + length + 1);
          const combined = normalizeSpaces(candidates.map((candidate) => candidate.text).join(' '));
          if (normalizeComparable(combined) === normalizeComparable(expected)) {
            const right = Math.max(line.x + line.width,
              ...candidates.map((candidate) => candidate.x + candidate.width));
            output.push({
              ...line,
              text: `${ordinal}. ${expected}`,
              x: Math.min(line.x, ...candidates.map((candidate) => candidate.x)),
              width: right - Math.min(line.x, ...candidates.map((candidate) => candidate.x)),
              fontSize: Math.max(line.fontSize, ...candidates.map((candidate) => candidate.fontSize)),
            });
            index += length;
            break;
          }
        }
        if (output.at(-1)?.text === `${ordinal}. ${expected}`) continue;
      }
    }
    output.push(line);
  }
  return output;
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
  const ordered = [...lines].sort(readingOrder);
  if (columnCount < 2) return ordered;
  const bandOrder = (band: PdfLine[]): PdfLine[] => {
    const left = band.filter((line) => line.x < pageWidth * 0.48);
    const right = band.filter((line) => line.x >= pageWidth * 0.48);
    return [...left.sort(readingOrder), ...right.sort(readingOrder)];
  };
  const spanning = ordered.filter((line) => line.width > pageWidth * 0.7);
  let remaining = ordered.filter((line) => line.width <= pageWidth * 0.7);
  if (!spanning.length) return bandOrder(remaining);
  const result: PdfLine[] = [];
  for (const divider of spanning) {
    const above = remaining.filter((line) =>
      line.y > divider.y + Math.max(line.fontSize, divider.fontSize) * 0.3);
    result.push(...bandOrder(above), divider);
    const used = new Set(above);
    remaining = remaining.filter((line) => !used.has(line));
  }
  result.push(...bandOrder(remaining));
  return result;
}

function readingOrder(a: PdfLine, b: PdfLine): number {
  const vertical = b.y - a.y;
  return Math.abs(vertical) > Math.max(a.fontSize, b.fontSize) * 0.45 ? vertical : a.x - b.x;
}

function linesToBlocks(
  lines: PdfLine[],
  page: PdfPageAnalysis,
  options: ConverterOptions,
  tocHeadings: Map<number, string>,
  tocPage: boolean,
): Block[] {
  if (lines.length === 0) return [];
  const sizes = lines.map((line) => line.fontSize).filter((size) => size > 0).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] ?? 12;
  const bodyLeftCandidates = lines
    .filter((line) => line.width > page.width * 0.35 && line.x < page.width * 0.35)
    .map((line) => line.x)
    .sort((a, b) => a - b);
  const bodyLeft = bodyLeftCandidates[Math.floor(bodyLeftCandidates.length * 0.15)]
    ?? Math.min(...lines.map((line) => line.x));
  const typicalGap = typicalLineGap(lines, median);
  const blocks: Block[] = [];
  let paragraph = '';
  let previous: PdfLine | undefined;
  const figures = [...(page.figures ?? [])].sort((a, b) => a.y - b.y || a.x - b.x);
  const imageLines = new Map<PdfLine, NonNullable<PdfPageAnalysis['figures']>[number]>();
  if (page.columnCount > 1) {
    for (const figure of figures) {
      imageLines.set({
        text: '', x: figure.x, y: page.height - figure.y,
        width: figure.width, fontSize: median, fontName: 'pdf-figure',
      }, figure);
    }
  }
  const readingLines = page.columnCount > 1 && imageLines.size
    ? orderLines([...lines, ...imageLines.keys()], page.width, page.columnCount)
    : lines;
  let figureIndex = 0;

  const flush = (): void => {
    const text = normalizeTypography(normalizeSpaces(paragraph), options.normalizeTypography);
    if (text) blocks.push({ kind: 'paragraph', text, sourcePages: [page.pageNumber] });
    paragraph = '';
  };

  const appendFigure = (figure: NonNullable<PdfPageAnalysis['figures']>[number]): void => {
    flush();
    blocks.push({
      kind: 'figure',
      text: `[[figura:${figure.id}]]`,
      figureId: figure.id,
      sourcePages: [page.pageNumber],
    });
  };
  const includeFiguresBefore = (top: number): void => {
    if (page.columnCount > 1) return;
    while (figureIndex < figures.length && figures[figureIndex]!.y <= top) {
      appendFigure(figures[figureIndex]!);
      figureIndex += 1;
    }
  };

  for (const [index, line] of readingLines.entries()) {
    const figure = imageLines.get(line);
    if (figure) {
      appendFigure(figure);
      previous = undefined;
      continue;
    }
    includeFiguresBefore(page.height - line.y);
    let text = normalizeSpaces(line.text);
    if (!text) continue;
    const short = text.length <= 140;
    const standaloneHeading = looksLikeStandaloneHeading(text, line, page);
    const headingPattern = CHAPTER_HEADING.test(text) &&
      (EDITORIAL_HEADING.test(text) || line.fontSize >= median * 1.3 || standaloneHeading);
    const knownHeading = isKnownHeading(text, tocHeadings);
    const editorialHeading = EDITORIAL_HEADING.test(text) && (!tocPage || /^(?:sum[aá]rio|contents)$/iu.test(text));
    const subheading = looksLikeSubheading(text, line, readingLines[index - 1],
      readingLines[index + 1], page, median);
    const heading = !CATALOG_ENTRY.test(text) && (tocPage
      ? /^(?:sum[aá]rio|contents)$/iu.test(text)
      : short && (headingPattern || knownHeading || editorialHeading || standaloneHeading || subheading));
    const footnote = line.fontSize <= median * 0.78 && line.y < page.height * 0.32;

    if (heading) {
      flush();
      text = normalizeTypography(text, options.normalizeTypography);
      blocks.push({
        kind: 'heading',
        text,
        sourcePages: [page.pageNumber],
        level: headingPattern || knownHeading || editorialHeading ? 1 : 2,
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
    const paragraphGap = previous && verticalGap > typicalGap * 1.18;
    const indented = previous && line.x < page.width * 0.45 && line.x - bodyLeft > Math.max(5, median * 0.52);
    const wordCount = paragraph.split(/\s+/u).filter(Boolean).length;
    const readableBoundary = previous && STRONG_SENTENCE_END.test(paragraph) && /^\p{Lu}/u.test(text);
    const safetyBoundary = wordCount >= 120 && readableBoundary;
    const listBoundary = /^[•▪◦‣–—*-]\s+|^\d{1,3}[.)]\s+/u.test(text);
    const sideOf = (value: PdfLine): number => value.width > page.width * 0.7 ? 2
      : value.x >= page.width * 0.48 ? 1 : 0;
    const columnBoundary = previous && page.columnCount > 1 && sideOf(previous) !== sideOf(line);
    if (paragraph && (columnBoundary || paragraphGap ||
      (indented && SENTENCE_END.test(paragraph)) || safetyBoundary || listBoundary)) flush();
    paragraph = joinLine(paragraph, text, options.dehyphenate);
    previous = line;
  }
  includeFiguresBefore(Number.POSITIVE_INFINITY);
  flush();
  return blocks;
}

function typicalLineGap(lines: PdfLine[], medianFontSize: number): number {
  const gaps: number[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const previous = lines[index - 1]!;
    const current = lines[index]!;
    const ratio = Math.max(previous.fontSize, current.fontSize) /
      Math.max(1, Math.min(previous.fontSize, current.fontSize));
    const gap = previous.y - current.y;
    if (ratio <= 1.15 && gap >= medianFontSize * 0.7 && gap <= medianFontSize * 3.5) gaps.push(gap);
  }
  if (gaps.length === 0) return medianFontSize * 1.7;
  gaps.sort((left, right) => left - right);
  return gaps[Math.floor(gaps.length / 2)] ?? medianFontSize * 1.7;
}

function isKnownHeading(text: string, headings: Map<number, string>): boolean {
  const numbered = text.match(CHAPTER_NUMBER);
  if (numbered) {
    const expected = headings.get(Number(numbered[1]));
    if (expected && normalizeComparable(text.replace(CHAPTER_NUMBER, '')) === normalizeComparable(expected)) return true;
  }
  const comparable = normalizeComparable(text);
  return [...headings.values()].some((heading) => normalizeComparable(heading) === comparable);
}

function looksLikeSubheading(
  text: string,
  line: PdfLine,
  previous: PdfLine | undefined,
  next: PdfLine | undefined,
  page: PdfPageAnalysis,
  median: number,
): boolean {
  const words = text.split(/\s+/u).filter(Boolean);
  if (words.length === 0 || words.length > 16 || text.length > 120) return false;
  if (!/^[\p{Lu}\d“‘«]/u.test(text) || /[.!?…][”’»)]?$/u.test(text) || SENTENCE_LIKE.test(text)) return false;
  if (line.fontSize < median * 1.34) return false;
  const centered = Math.abs((line.x + line.width / 2) - page.width / 2) < page.width * 0.12;
  const gapBefore = previous ? previous.y - line.y : Number.POSITIVE_INFINITY;
  const gapAfter = next ? line.y - next.y : Number.POSITIVE_INFINITY;
  const isolated = gapBefore > line.fontSize * 1.38 || gapAfter > line.fontSize * 1.38;
  return centered || isolated;
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
  if (dehyphenate && /\p{L}-$/u.test(previous) && /^\p{L}/u.test(next)) {
    const prefix = previous.match(/([\p{L}]+)-$/u)?.[1]?.toLocaleLowerCase() ?? '';
    const keepsHyphen = /^(?:vice|ex|rec[eé]m|pr[eé]|p[oó]s|sem|al[eé]m|aqu[eé]m)$/u.test(prefix) || /^\p{Lu}/u.test(next);
    return keepsHyphen ? previous + next : previous.slice(0, -1) + next;
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

function splitLongParagraphs(blocks: Block[]): Block[] {
  return blocks.flatMap((block) => {
    if (block.kind !== 'paragraph' || wordCount(block.text) <= 180) return [block];
    const sentences = block.text.match(/[^.!?…]+(?:[.!?…]+[”’»)]*|$)/gu)
      ?.map((sentence) => normalizeSpaces(sentence))
      .filter(Boolean) ?? [block.text];
    if (sentences.length < 2) return [block];
    const chunks: string[] = [];
    let current = '';
    for (const sentence of sentences) {
      const candidate = normalizeSpaces(`${current} ${sentence}`);
      if (current && wordCount(candidate) > 160 && wordCount(current) >= 70) {
        chunks.push(current);
        current = sentence;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);
    return chunks.map((text) => ({ ...block, text, sourcePages: [...block.sourcePages] }));
  });
}

function wordCount(value: string): number {
  return value.split(/\s+/u).filter(Boolean).length;
}

function splitIntoSections(blocks: Block[], documentTitle: string): EditableSection[] {
  const sections: EditableSection[] = [];
  let title = documentTitle || 'Conteúdo';
  let current: Block[] = [];
  const firstMajorHeading = blocks.findIndex((block) => block.kind === 'heading' && block.level === 1);

  const flush = (sectionTitle?: string): void => {
    if (current.length === 0) return;
    const sourcePages = [...new Set(current.flatMap((block) => block.sourcePages))];
    const html = blocksToHtml(current);
    const plainText = current.map((block) => block.text).join('\n\n');
    const resolvedTitle = sectionTitle || inferSectionTitle(current, title, documentTitle, sections.length);
    sections.push({
      id: `section-${String(sections.length + 1).padStart(3, '0')}`,
      title: resolvedTitle,
      html,
      plainText,
      sourcePages,
    });
    current = [];
  };

  for (const [index, block] of blocks.entries()) {
    const previousPage = current.at(-1)?.sourcePages.at(-1);
    const blockPage = block.sourcePages[0];
    if (index <= firstMajorHeading && current.length > 0 && previousPage !== blockPage) {
      flush();
    }
    if (block.kind === 'heading' && block.level === 2 &&
      normalizeComparable(block.text) === normalizeComparable(documentTitle)) {
      block.level = 1;
    }
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
  return mergeAdjacentSections(sections);
}

function mergeAdjacentSections(sections: EditableSection[]): EditableSection[] {
  const merged: EditableSection[] = [];
  for (const section of sections) {
    const previous = merged.at(-1);
    if (previous && normalizeComparable(previous.title) === normalizeComparable(section.title)) {
      previous.html = `${previous.html}\n${section.html}`;
      previous.plainText = `${previous.plainText}\n\n${section.plainText}`;
      previous.sourcePages = [...new Set([...previous.sourcePages, ...section.sourcePages])];
      continue;
    }
    merged.push({ ...section, sourcePages: [...section.sourcePages] });
  }
  return merged.map((section, index) => ({
    ...section,
    id: `section-${String(index + 1).padStart(3, '0')}`,
  }));
}

function inferSectionTitle(
  blocks: Block[],
  currentTitle: string,
  documentTitle: string,
  sectionIndex: number,
): string {
  const firstMajor = blocks.find((block) => block.kind === 'heading' && block.level === 1);
  if (firstMajor) return firstMajor.text;
  const text = blocks.map((block) => block.text).join(' ').toLocaleLowerCase();
  if (/isbn|copyright|todos os direitos|cataloga[cç][aã]o/u.test(text)) return 'Créditos editoriais';
  if (text.length < 650 && sectionIndex > 0) return 'Dedicatória';
  if (sectionIndex === 0) return documentTitle || currentTitle || 'Conteúdo';
  return currentTitle || `Seção ${sectionIndex + 1}`;
}

function blocksToHtml(blocks: Block[]): string {
  const output: string[] = [];
  let page = -1;
  for (const block of blocks) {
    const sourcePage = block.sourcePages[0] ?? page;
    if (sourcePage !== page && sourcePage > 0) {
      output.push(`<span id="page-${sourcePage}" class="pagebreak" epub:type="pagebreak" title="${sourcePage}"></span>`);
      page = sourcePage;
    }
    output.push(blockToHtml(block));
  }
  return output.join('\n');
}

function normalizeComparable(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLocaleLowerCase();
}

function blockToHtml(block: Block): string {
  const text = escapeXml(block.text);
  if (block.kind === 'figure' && block.figureId) {
    const page = block.sourcePages[0] ?? 1;
    return `<figure class="pdf-inline-figure"><img src="../Images/${block.figureId}.jpg" alt="Ilustração, quadro ou formulário da página ${page} do PDF"/></figure>`;
  }
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
