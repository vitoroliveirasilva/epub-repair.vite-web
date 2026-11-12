import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { locateEmbeddedImageRegions, type PdfImageRegion } from './imageExtraction';
import type { PDFDocumentProxy, PDFPageProxy, TextItem } from 'pdfjs-dist/types/src/display/api';
import type {
  ConversionLayout,
  ConversionWarning,
  ConverterOptions,
  PdfAnalysisResult,
  PdfLine,
  PdfPageAnalysis,
  PdfTextItem,
  PublicationMetadata,
} from './model';
import { detectColumnCount, reconstructDocument } from './textReconstruction';

const IMAGE_TEXT_READER_START_TIMEOUT_MS = 25_000;
const IMAGE_TEXT_PAGE_TIMEOUT_MS = 35_000;

export interface PdfProgress {
  phase: string;
  completed: number;
  total: number;
}

interface AnalyzePdfOptions {
  fileName: string;
  bytes: Uint8Array;
  options: ConverterOptions;
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: PdfProgress) => void) | undefined;
}

export async function analyzePdf(input: AnalyzePdfOptions): Promise<PdfAnalysisResult> {
  throwIfAborted(input.signal);
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({
    data: input.bytes.slice(),
    isEvalSupported: false,
    enableXfa: false,
    useSystemFonts: true,
  });
  const cancel = (): void => { void task.destroy(); };
  input.signal?.addEventListener('abort', cancel, { once: true });
  let document: PDFDocumentProxy | undefined;
  let ocrWorker: Awaited<ReturnType<typeof createOcrWorker>> | undefined;
  let imageTextReadingUnavailable = false;
  try {
    document = await task.promise;
    throwIfAborted(input.signal);
    const metadata = await document.getMetadata().catch(() => undefined);
    const pages: PdfPageAnalysis[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      throwIfAborted(input.signal);
      input.onProgress?.({
        phase: `Analisando página ${pageNumber} de ${document.numPages}`,
        completed: Math.round(((pageNumber - 1) / document.numPages) * 70),
        total: 100,
      });
      const page = await document.getPage(pageNumber);
      const pageAnalysis = await analyzePage(page, pageNumber, pdfjs.OPS, pageNumber === 1);
      pages.push(pageAnalysis);
      page.cleanup();
      if (pageNumber % 4 === 0) await yieldToBrowser();
    }
    const imageTextPages = input.options.enableOcr
      ? selectPagesForImageTextReading(pages)
      : [];
    for (let index = 0; index < imageTextPages.length; index += 1) {
      if (imageTextReadingUnavailable) break;
      throwIfAborted(input.signal);
      const pageAnalysis = imageTextPages[index]!;
      const pageNumber = pageAnalysis.pageNumber;
      try {
        if (!ocrWorker) {
          const workerPromise = createOcrWorker(input.options.language, input.signal,
            (status, progress) => input.onProgress?.({
              phase: `Lendo texto da página ${pageNumber}: ${translateOcrStatus(status)}`,
              completed: Math.round(70 + ((index + Math.max(0, Math.min(1, progress))) / Math.max(1, imageTextPages.length)) * 25),
              total: 100,
            }));
          try {
            ocrWorker = await withTimeout(workerPromise, IMAGE_TEXT_READER_START_TIMEOUT_MS,
              'A leitura de páginas digitalizadas demorou demais para iniciar.', input.signal);
          } catch (error) {
            void workerPromise.then((worker) => worker.terminate()).catch(() => undefined);
            throw error;
          }
        }
        input.onProgress?.({
          phase: `Lendo texto da página ${pageNumber} de ${document.numPages}`,
          completed: Math.round(70 + (index / Math.max(1, imageTextPages.length)) * 25),
          total: 100,
        });
        const page = await document.getPage(pageNumber);
        const rendered = await renderPageToCanvas(page, 1.65);
        try {
          throwIfAborted(input.signal);
          const recognized = await withTimeout(
            ocrWorker.recognize(rendered.canvas),
            IMAGE_TEXT_PAGE_TIMEOUT_MS,
            `A leitura da página ${pageNumber} demorou demais.`,
            input.signal,
          );
          throwIfAborted(input.signal);
          const text = normalizeOcrText(recognized.data.text);
          if (text.length > 0) {
            pageAnalysis.lines = ocrTextToLines(text, pageAnalysis.height);
            pageAnalysis.text = text;
            pageAnalysis.usedOcr = true;
            pageAnalysis.ocrConfidence = recognized.data.confidence;
            pageAnalysis.columnCount = 1;
          }
        } finally {
          releaseCanvas(rendered.canvas);
          page.cleanup();
        }
      } catch (error) {
        if (input.signal?.aborted) throw abortError();
        imageTextReadingUnavailable = true;
        input.onProgress?.({
          phase: 'A leitura das páginas digitalizadas demorou demais; continuando sem bloquear',
          completed: 96,
          total: 100,
        });
        await ocrWorker?.terminate().catch(() => undefined);
        ocrWorker = undefined;
        await yieldToBrowser();
        if (!(error instanceof Error)) break;
      }
    }
    input.onProgress?.({
      phase: 'Reconstruindo capítulos e parágrafos',
      completed: 98,
      total: 100,
    });
    const fallbackTitle = humanizeFileName(input.fileName) || 'Documento convertido';
    const frontMatterText = pages.slice(0, 24).map((page) => page.text).join('\n');
    const identity = inferDocumentIdentity(frontMatterText, fallbackTitle);
    const title = meaningfulMetadataValue(metadataString(metadata?.info, 'Title')) || identity.title;
    const author = meaningfulMetadataValue(metadataString(metadata?.info, 'Author')) || identity.author;
    const publicationMetadata = inferPublicationMetadata(
      frontMatterText,
      metadata?.info,
    );
    const reconstructed = reconstructDocument(pages, input.options, title);
    const nativeTextPages = pages.filter((page) => page.kind === 'text').length;
    const ocrPages = pages.filter((page) => page.usedOcr).length;
    const scannedPages = pages.filter((page) => page.kind === 'scanned').length;
    const visualPages = pages.filter((page) => page.kind === 'visual').length;
    const blankPages = pages.filter((page) => page.kind === 'blank').length;
    const preservedFigures = pages.reduce((sum, page) => sum + (page.figures?.length ?? 0), 0);
    const unpreservedGraphicPages = pages.filter((page) =>
      page.kind === 'text' && page.imageCount > 0 && !page.figures?.length).length;
    const warnings = [
      ...baseWarnings(pages, input.options, imageTextReadingUnavailable),
      ...reconstructed.warnings,
      ...(preservedFigures > 0 ? [{
        code: 'PDF_INLINE_FIGURES_PRESERVED',
        title: 'Ilustrações preservadas',
        detail: `${preservedFigures} ilustração(ões), quadro(s) ou formulário(s) incorporado(s) no texto ajustável.`,
        severity: 'info' as const,
      }] : []),
      ...(unpreservedGraphicPages > 0 ? [{
        code: 'PDF_GRAPHICS_NEED_REVIEW',
        title: 'Alguns elementos gráficos precisam de conferência',
        detail: `${unpreservedGraphicPages} página(s) com elementos gráficos pequenos ou não extraíveis automaticamente. Confira a prévia e use o layout visual se necessário.`,
        severity: 'warning' as const,
      }] : []),
    ];
    const suggestedLayout = suggestLayout(pages, input.options, warnings);
    return {
      fileName: input.fileName,
      fileSize: input.bytes.length,
      pageCount: document.numPages,
      title,
      author,
      metadata: publicationMetadata,
      pages,
      sections: reconstructed.sections,
      warnings,
      suggestedLayout,
      nativeTextPages,
      ocrPages,
      scannedPages,
      visualPages,
      blankPages,
      repeatedMarginLines: reconstructed.repeatedMarginLines,
      qualityScore: calculateQualityScore(pages, warnings),
    };
  } catch (error) {
    if (input.signal?.aborted) throw abortError();
    const name = error instanceof Error ? error.name : '';
    if (name === 'PasswordException') {
      throw new Error('O PDF está protegido por senha. Remova a proteção em uma cópia autorizada antes de converter.', { cause: error });
    }
    throw error;
  } finally {
    input.signal?.removeEventListener('abort', cancel);
    await ocrWorker?.terminate().catch(() => undefined);
    await document?.destroy();
  }
}

export function selectPagesForImageTextReading(pages: PdfPageAnalysis[]): PdfPageAnalysis[] {
  const scanned = pages.filter((page) => page.kind === 'scanned');
  const contentPages = pages.filter((page) => page.kind !== 'cover' && page.kind !== 'blank');
  const mostlyScannedDocument = scanned.length >= 2 &&
    scanned.length >= Math.ceil(Math.max(1, contentPages.length) * 0.35);
  if (mostlyScannedDocument) return scanned;
  return scanned.filter((page) => page.pageNumber > 6);
}

export function inferPublicationMetadata(
  text: string,
  info?: object,
): PublicationMetadata {
  const normalized = text.replace(/\r/gu, '');
  const rawIsbn = normalized.match(/\bISBN(?:-1[03])?[ \t]*:?[ \t\u00a0]*((?:97[89][ \t-]*)?[\dXx](?:[\dXx \t\u00a0-]{8,20})[\dXx])\b/u)?.[1] ?? '';
  const isbn = rawIsbn.replace(/[^\dXx]/gu, '').toUpperCase();
  const translator = firstCapture(normalized, [
    /(?:^|\n)\s*tradu[cç][aã]o\s*:\s*(.+?)(?=\n)/iu,
    /tradu[cç][aã]o\s+de\s+(.+?)(?=\s+\d+[ªº]?\s+edi[cç][aã]o|\s+EDITORA\b|\n)/iu,
    /;\s*tradu[cç][aã]o\s+(.+?)(?=\.\s*-\s*\d|\n)/iu,
    /translated\s+by\s+(.+?)(?=\n|\s+\d{4}\b)/iu,
  ]);
  const publisher = inferPublisher(normalized);
  const publicationDate = normalized.match(/copyright\s+(?:da\s+)?tradu[cç][aã]o\s*:\s*(?:©\s*)?(19\d{2}|20\d{2})/iu)?.[1]
    ?? normalized.match(/edi[cç][aã]o\s+digital\s*:\s*(?:\p{L}+\s+)?(19\d{2}|20\d{2})/iu)?.[1]
    ?? normalized.match(/\b(?:19\d{2}|20\d{2})\s*\.\s*\n\s*tradu[cç][aã]o\s+de/iu)?.[0]?.match(/(?:19|20)\d{2}/u)?.[0]
    ?? normalized.match(/(?:copyright|©)\s*(?:©\s*)?(19\d{2}|20\d{2})/iu)?.[1]
    ?? metadataYear(info)
    ?? '';
  const description = metadataString(info, 'Subject');
  return {
    publisher,
    publicationDate,
    isbn: isbn.length === 10 || isbn.length === 13 ? isbn : '',
    translator: cleanMetadataValue(translator),
    description,
  };
}

export function inferDocumentIdentity(
  text: string,
  fallbackTitle: string,
): { title: string; author: string } {
  const normalized = text.replace(/\r/gu, '');
  const catalogTitle = firstCapture(normalized, [
    /(?:^|\n)\s*([^\n]{4,180})\s*\/\s*(?:organizadores?|organizado\s+por|por|by)\b/iu,
  ]);
  const title = cleanTitle(catalogTitle) || fallbackTitle;
  const catalogAuthor = firstCapture(normalized, [
    /\borganizadores?\s+(.+?)\s*;\s*tradu[cç][aã]o\b/isu,
    /(?:^|\n)\s*(?:por|by)\s+([^\n]{4,180})(?=\n)/iu,
  ]);
  return { title, author: cleanAuthor(catalogAuthor) };
}

function cleanTitle(value: string): string {
  return cleanMetadataValue(value)
    .replace(/^\s*(?:\d{1,4}|[A-Z]\d{2,5})\s+/u, '')
    .replace(/\s*\[recurso\s+eletr[oô]nico\]\s*$/iu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function cleanAuthor(value: string): string {
  return cleanMetadataValue(value)
    .replace(/\s*[-–]\s*\d+[ªº]?\s*ed\..*$/iu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function humanizeFileName(fileName: string): string {
  return fileName.replace(/\.pdf$/iu, '')
    .replace(/[_-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function meaningfulMetadataValue(value: string): string {
  if (!value || /^(?:untitled|sem\s+t[ií]tulo|unknown|desconhecido)$/iu.test(value)) return '';
  return value;
}

function inferPublisher(text: string): string {
  const rights = text.match(/(?:adquiridos|publicados?)\s+(?:pela|por)\s+((?:EDITORA\s+)?[\p{L}\d&'’.-]+(?:\s+[\p{L}\d&'’.-]+){0,5}?)(?=\.\s+(?:Rua|Avenida)|,\s+que\b|\n)/iu)?.[1];
  if (rights) return formatPublisher(rights);
  const reserved = text.match(/(?:direitos[^\n]{0,80}?reservados?\s+(?:à|a)\s*)\n?\s*((?:Editora\s+)[^\n]{2,100})/iu)?.[1];
  if (reserved) return formatPublisher(reserved);
  const line = text.split('\n').find((candidate) => /\bEDITORA\s+/iu.test(candidate));
  if (!line) return '';
  const after = line.slice(line.search(/\bEDITORA\s+/iu) + 'EDITORA '.length);
  const stopWords = new Set(['RIO', 'SÃO', 'SAO', 'RUA', 'AVENIDA', 'LTDA', 'LTDA.', 'S.A.', 'SA']);
  const tokens: string[] = [];
  for (const token of after.split(/\s+/u)) {
    const cleaned = token.replace(/^[^\p{L}\d]+|[^\p{L}\d.&'-]+$/gu, '');
    if (!cleaned || stopWords.has(cleaned.toLocaleUpperCase()) || /^\d{4}$/u.test(cleaned)) break;
    tokens.push(cleaned);
    if (tokens.length === 4) break;
  }
  return tokens.length > 0 ? formatPublisher(`Editora ${tokens.join(' ')}`) : '';
}

function formatPublisher(value: string): string {
  const cleaned = cleanMetadataValue(value)
    .replace(/\s+(?:LTDA\.?|S\.?A\.?)$/iu, '')
    .trim();
  if (!cleaned || cleaned !== cleaned.toLocaleUpperCase()) return cleaned;
  return cleaned.toLocaleLowerCase().replace(/(^|[\s'-])\p{L}/gu,
    (letter) => letter.toLocaleUpperCase());
}

function firstCapture(value: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const captured = value.match(pattern)?.[1];
    if (captured) return captured;
  }
  return '';
}

function cleanMetadataValue(value: string): string {
  return value.replace(/\s+/gu, ' ').replace(/[.;,:-]+$/gu, '').trim().slice(0, 160);
}

function metadataYear(info: object | undefined): string | undefined {
  const value = metadataString(info, 'CreationDate');
  return value.match(/(?:19|20)\d{2}/u)?.[0];
}

export async function renderPdfPages(
  bytes: Uint8Array,
  signal: AbortSignal | undefined,
  onPage: (pageNumber: number, pageCount: number, image: Blob, width: number, height: number) => Promise<void>,
): Promise<void> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, enableXfa: false });
  const cancel = (): void => { void task.destroy(); };
  signal?.addEventListener('abort', cancel, { once: true });
  let document: PDFDocumentProxy | undefined;
  try {
    document = await task.promise;
    for (let index = 1; index <= document.numPages; index += 1) {
      throwIfAborted(signal);
      const page = await document.getPage(index);
      const rendered = await renderPageToCanvas(page, fixedLayoutScale(page));
      const blob = await canvasToBlob(rendered.canvas, 'image/jpeg', 0.84);
      await onPage(index, document.numPages, blob, rendered.width, rendered.height);
      releaseCanvas(rendered.canvas);
      page.cleanup();
      if (index % 3 === 0) await yieldToBrowser();
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    await document?.destroy();
  }
}

export async function renderPdfPagePreview(
  bytes: Uint8Array,
  pageNumber: number,
  signal?: AbortSignal,
): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, enableXfa: false });
  const cancel = (): void => { void task.destroy(); };
  signal?.addEventListener('abort', cancel, { once: true });
  let document: PDFDocumentProxy | undefined;
  try {
    document = await task.promise;
    const bounded = Math.max(1, Math.min(document.numPages, pageNumber));
    const page = await document.getPage(bounded);
    const rendered = await renderPageToCanvas(page, 1.15);
    const dataUrl = rendered.canvas.toDataURL('image/jpeg', 0.84);
    releaseCanvas(rendered.canvas);
    page.cleanup();
    return dataUrl;
  } finally {
    signal?.removeEventListener('abort', cancel);
    await document?.destroy();
  }
}

async function analyzePage(
  page: PDFPageProxy,
  pageNumber: number,
  ops: Record<string, number>,
  createPreview: boolean,
): Promise<PdfPageAnalysis> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false });
  const items: PdfTextItem[] = content.items
    .filter((item): item is TextItem => 'str' in item)
    .map((item) => {
      const transform: unknown[] = item.transform;
      return {
        text: item.str,
        x: numericValue(transform[4]),
        y: numericValue(transform[5]),
        width: Math.abs(item.width),
        height: Math.abs(item.height),
        fontSize: Math.max(1, Math.hypot(numericValue(transform[2]), numericValue(transform[3]))),
        fontName: item.fontName,
        hasEol: item.hasEOL,
      };
    })
    .filter((item) => item.text.trim().length > 0);
  const lines = groupItemsIntoLines(items);
  const text = lines.map((line) => line.text).join('\n');
  const operatorList = await page.getOperatorList();
  const imageOperators = new Set([
    ops.paintImageXObject,
    ops.paintInlineImageXObject,
    ops.paintImageMaskXObject,
    ops.paintSolidColorImageMask,
  ].filter((value): value is number => typeof value === 'number'));
  const imageCount = operatorList.fnArray.filter((operator) => imageOperators.has(operator)).length;
  const nativeCharacters = text.replace(/\s/gu, '').length;
  const kind = classifyPage(pageNumber, nativeCharacters, imageCount);
  const preserveAsImage = kind === 'cover' || kind === 'scanned' || kind === 'visual';
  const regions = kind === 'text' && imageCount > 0
    ? locateEmbeddedImageRegions(operatorList.fnArray, operatorList.argsArray as unknown[][], ops, viewport)
    : [];
  const figures: NonNullable<PdfPageAnalysis['figures']> = [];
  let previewDataUrl: string | undefined;
  if (createPreview || preserveAsImage || regions.length > 0) {
    const scale = regions.length > 0 ? Math.min(1.9, 1700 / Math.max(viewport.width, viewport.height))
      : kind === 'cover' ? 1.65 : 1.15;
    const rendered = await renderPageToCanvas(page, scale);
    try {
      if (createPreview || preserveAsImage) {
        previewDataUrl = rendered.canvas.toDataURL('image/jpeg', kind === 'cover' ? 0.9 : 0.84);
      }
      for (const [index, region] of regions.entries()) {
        figures.push({
          id: `figure-${String(pageNumber).padStart(4, '0')}-${String(index + 1).padStart(2, '0')}`,
          pageNumber, ...region, dataUrl: cropPdfImage(rendered.canvas, region, scale),
        });
      }
    } finally {
      releaseCanvas(rendered.canvas);
    }
  }
  return {
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    lines,
    text,
    nativeCharacters,
    usedOcr: false,
    columnCount: detectColumnCount(lines, viewport.width),
    imageCount,
    kind,
    preserveAsImage,
    ...(figures.length ? { figures } : {}),
    ...(previewDataUrl ? { previewDataUrl } : {}),
  };
}

export function groupItemsIntoLines(items: PdfTextItem[]): PdfLine[] {
  const sorted = [...items].sort((a, b) => {
    const vertical = b.y - a.y;
    return Math.abs(vertical) > Math.max(a.fontSize, b.fontSize) * 0.38 ? vertical : a.x - b.x;
  });
  const lines: Array<{ items: PdfTextItem[]; y: number }> = [];
  for (const item of sorted) {
    const tolerance = Math.max(2.5, item.fontSize * 0.42);
    const line = lines.find((candidate) => {
      if (Math.abs(candidate.y - item.y) > tolerance) return false;
      const right = Math.max(...candidate.items.map((part) => part.x + part.width));
      const left = Math.min(...candidate.items.map((part) => part.x));
      const gap = item.x >= right ? item.x - right :
        left >= item.x + item.width ? left - item.x - item.width : 0;
      const currentTextLength = candidate.items.reduce((total, part) =>
        total + part.text.trim().length, 0);
      return !(currentTextLength >= 10 &&
        gap > Math.max(40, item.fontSize * 3.2));
    });
    if (line) {
      line.items.push(item);
      line.y = (line.y * (line.items.length - 1) + item.y) / line.items.length;
    } else {
      lines.push({ items: [item], y: item.y });
    }
  }
  return lines.map((line) => {
    const ordered = line.items.sort((a, b) => a.x - b.x);
    let text = '';
    let right = 0;
    for (const [index, item] of ordered.entries()) {
      const gap = item.x - right;
      const previous = ordered[index - 1];
      const potentialMissingSpace = previous &&
        previous.fontName !== item.fontName &&
        gap >= -Math.max(0.6, item.fontSize * 0.05) &&
        !/\s$/u.test(text) &&
        /\b(?:um|uma|o|a|os|as|de|do|da|dos|das|no|na|nos|nas|ao|aos|ou)$/iu.test(text) &&
        /^\p{Lu}/u.test(item.text);
      if (text && (gap > Math.max(1.6, item.fontSize * 0.18) || potentialMissingSpace)) text += ' ';
      text += item.text;
      right = Math.max(right, item.x + item.width);
    }
    const first = ordered[0]!;
    return {
      text: text.replace(/\s+/gu, ' ').trim(),
      x: first.x,
      y: line.y,
      width: Math.max(...ordered.map((item) => item.x + item.width)) - first.x,
      fontSize: ordered.reduce((sum, item) => sum + item.fontSize, 0) / ordered.length,
      fontName: first.fontName,
    };
  }).filter((line) => line.text.length > 0);
}

function cropPdfImage(canvas: HTMLCanvasElement, region: PdfImageRegion, scale: number): string {
  const padding = Math.ceil(2 * scale);
  const left = Math.max(0, Math.floor(region.x * scale) - padding);
  const top = Math.max(0, Math.floor(region.y * scale) - padding);
  const width = Math.min(canvas.width - left, Math.ceil(region.width * scale) + padding * 2);
  const height = Math.min(canvas.height - top, Math.ceil(region.height * scale) + padding * 2);
  const crop = document.createElement('canvas');
  crop.width = Math.max(1, width);
  crop.height = Math.max(1, height);
  const context = crop.getContext('2d', { alpha: false });
  if (!context) throw new Error('Não foi possível preservar uma ilustração do PDF.');
  context.drawImage(canvas, left, top, crop.width, crop.height, 0, 0, crop.width, crop.height);
  const result = crop.toDataURL('image/jpeg', 0.91);
  releaseCanvas(crop);
  return result;
}

async function renderPageToCanvas(
  page: PDFPageProxy,
  scale: number,
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('O navegador não disponibilizou Canvas 2D para processar o PDF.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return { canvas, width: canvas.width, height: canvas.height };
}

async function createOcrWorker(
  language: ConverterOptions['language'],
  signal: AbortSignal | undefined,
  onProgress: (status: string, progress: number) => void,
) {
  const { createWorker, OEM } = await import('tesseract.js');
  throwIfAborted(signal);
  const worker = await createWorker(language === 'pt-BR' ? 'por' : 'eng', OEM.LSTM_ONLY, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/tesseract-core-lstm.wasm.js',
    langPath: '/ocr',
    workerBlobURL: false,
    cacheMethod: 'readOnly',
    logger: (message) => onProgress(message.status, message.progress),
  });
  const terminate = (): void => { void worker.terminate(); };
  signal?.addEventListener('abort', terminate, { once: true });
  return worker;
}

function ocrTextToLines(text: string, pageHeight: number): PdfLine[] {
  const raw = text.split(/\n+/u).map((line) => line.trim()).filter(Boolean);
  return raw.map((line, index) => ({
    text: line,
    x: 36,
    y: pageHeight - 48 - index * 15,
    width: Math.max(1, line.length * 6),
    fontSize: 12,
    fontName: 'OCR',
  }));
}

function baseWarnings(
  pages: PdfPageAnalysis[],
  options: ConverterOptions,
  imageTextReadingUnavailable: boolean,
): ConversionWarning[] {
  const warnings: ConversionWarning[] = [];
  if (imageTextReadingUnavailable) {
    warnings.push({
      code: 'PDF_IMAGE_TEXT_READING_TIMEOUT',
      title: 'Leitura de páginas digitalizadas interrompida',
      detail: 'A leitura automática demorou além do limite seguro. A análise continuou e preservou essas páginas como imagem, sem travar o restante do documento.',
      severity: 'warning',
    });
  }
  const withoutText = pages.filter((page) => page.kind === 'scanned' && !page.usedOcr);
  if (withoutText.length > 0) {
    warnings.push({
      code: 'PDF_PAGES_WITHOUT_TEXT',
      title: 'Páginas sem texto recuperável',
      detail: `${withoutText.length} página(s) não possui(em) texto selecionável${options.enableOcr ? ' e a leitura da imagem não recuperou conteúdo suficiente' : ''}.`,
      severity: 'warning',
    });
  }
  const imageRich = pages.filter((page) => page.kind === 'visual' || page.kind === 'scanned').length;
  if (imageRich > 0) {
    warnings.push({
      code: 'PDF_IMAGE_RICH_PAGES',
      title: 'Documento com páginas visuais',
      detail: `${imageRich} página(s) visual(is) será(ão) preservada(s) como imagem no EPUB ajustável. O modo visual mantém todas as páginas integralmente.`,
      severity: 'info',
    });
  }
  return warnings;
}

function suggestLayout(
  pages: PdfPageAnalysis[],
  options: ConverterOptions,
  warnings: ConversionWarning[],
): ConversionLayout {
  if (options.profile === 'visual') return 'fixed';
  const contentPages = pages.filter((page) => page.kind !== 'cover' && page.kind !== 'blank');
  const weakPages = contentPages.filter((page) =>
    page.kind === 'scanned' && (!page.usedOcr || (page.ocrConfidence ?? 0) < 68)).length;
  const imageRich = contentPages.filter((page) => page.kind === 'visual').length;
  const multiColumn = warnings.some((warning) => warning.code === 'PDF_MULTIPLE_COLUMNS');
  return weakPages > contentPages.length * 0.2 ||
    imageRich > contentPages.length * 0.45 ||
    (options.profile === 'academic' && multiColumn)
    ? 'fixed'
    : 'reflowable';
}

function calculateQualityScore(
  pages: PdfPageAnalysis[],
  warnings: ConversionWarning[],
): number {
  if (pages.length === 0) return 0;
  const contentPages = pages.filter((page) => page.kind !== 'cover' && page.kind !== 'blank');
  if (contentPages.length === 0) return 0;
  const readable = contentPages.filter((page) =>
    page.kind === 'text' || page.kind === 'visual' || page.usedOcr).length;
  const ocrPenalty = contentPages.reduce((sum, page) =>
    sum + (page.usedOcr ? Math.max(0, 82 - (page.ocrConfidence ?? 0)) * 0.22 : 0), 0);
  const warningPenalty = warnings.filter((warning) => warning.severity === 'warning').length * 2.5;
  return Math.max(0, Math.min(100,
    Math.round((readable / contentPages.length) * 100 - ocrPenalty - warningPenalty)));
}

export function classifyPage(
  pageNumber: number,
  nativeCharacters: number,
  imageCount: number,
): PdfPageAnalysis['kind'] {
  if (pageNumber === 1 && imageCount > 0 && nativeCharacters < 120) return 'cover';
  if (nativeCharacters === 0 && imageCount === 0) return 'blank';
  if (nativeCharacters < 12 && imageCount > 0) return 'scanned';
  if (nativeCharacters < 80 && imageCount > 0) return 'visual';
  return 'text';
}

function fixedLayoutScale(page: PDFPageProxy): number {
  const viewport = page.getViewport({ scale: 1 });
  const longEdge = Math.max(viewport.width, viewport.height);
  return Math.max(1, Math.min(1.65, 1600 / Math.max(1, longEdge)));
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 1;
  canvas.height = 1;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function metadataString(info: object | undefined, key: string): string {
  if (!info || !(key in info)) return '';
  const value: unknown = Reflect.get(info, key);
  return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
}

function numericValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeOcrText(value: string): string {
  return value.replace(/\r/gu, '').replace(/[ \t]+\n/gu, '\n').replace(/\n{3,}/gu, '\n\n').trim();
}

function translateOcrStatus(status: string): string {
  const translations: Record<string, string> = {
    'loading tesseract core': 'carregando mecanismo local',
    'initializing tesseract': 'preparando leitor de páginas digitalizadas',
    'loading language traineddata': 'carregando idioma',
    'initializing api': 'preparando leitura da imagem',
    'recognizing text': 'identificando o texto da imagem',
  };
  return translations[status] ?? status;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  signal?: AbortSignal,
): Promise<T> {
  throwIfAborted(signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  const cancellation = new Promise<never>((_, reject) => {
    abort = () => reject(abortError());
    signal?.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([promise, timeout, cancellation]);
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Não foi possível renderizar uma página do PDF.'));
    }, type, quality);
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

function abortError(): DOMException {
  return new DOMException('Operação cancelada.', 'AbortError');
}
