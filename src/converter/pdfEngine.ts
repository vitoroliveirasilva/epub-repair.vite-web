import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
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
  try {
    document = await task.promise;
    throwIfAborted(input.signal);
    const metadata = await document.getMetadata().catch(() => undefined);
    const pages: PdfPageAnalysis[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      throwIfAborted(input.signal);
      input.onProgress?.({
        phase: `Analisando página ${pageNumber} de ${document.numPages}`,
        completed: pageNumber - 1,
        total: document.numPages,
      });
      const page = await document.getPage(pageNumber);
      const pageAnalysis = await analyzePage(page, pageNumber, pdfjs.OPS, pageNumber === 1);
      const needsOcr = pageAnalysis.kind === 'scanned';
      if (needsOcr && input.options.enableOcr) {
        ocrWorker ??= await createOcrWorker(input.options.language, input.signal,
          (status, progress) => input.onProgress?.({
            phase: `OCR da página ${pageNumber}: ${translateOcrStatus(status)}`,
            completed: Math.min(document?.numPages ?? 1,
              pageNumber - 1 + Math.max(0, Math.min(1, progress))),
            total: document?.numPages ?? 1,
          }));
        const rendered = await renderPageToCanvas(page, 2);
        throwIfAborted(input.signal);
        const recognized = await ocrWorker.recognize(rendered.canvas);
        releaseCanvas(rendered.canvas);
        throwIfAborted(input.signal);
        const text = normalizeOcrText(recognized.data.text);
        if (text.length > 0) {
          pageAnalysis.lines = ocrTextToLines(text, pageAnalysis.height);
          pageAnalysis.text = text;
          pageAnalysis.usedOcr = true;
          pageAnalysis.ocrConfidence = recognized.data.confidence;
          pageAnalysis.columnCount = 1;
        }
      }
      pages.push(pageAnalysis);
      page.cleanup();
      if (pageNumber % 4 === 0) await yieldToBrowser();
    }
    input.onProgress?.({
      phase: 'Reconstruindo capítulos e parágrafos',
      completed: document.numPages,
      total: document.numPages,
    });
    const fallbackTitle = input.fileName.replace(/\.pdf$/iu, '').trim() || 'Documento convertido';
    const title = metadataString(metadata?.info, 'Title') || fallbackTitle;
    const author = metadataString(metadata?.info, 'Author');
    const publicationMetadata = inferPublicationMetadata(
      pages.slice(0, 15).map((page) => page.text).join('\n'),
      metadata?.info,
    );
    const reconstructed = reconstructDocument(pages, input.options, title);
    const nativeTextPages = pages.filter((page) => page.kind === 'text').length;
    const ocrPages = pages.filter((page) => page.usedOcr).length;
    const scannedPages = pages.filter((page) => page.kind === 'scanned').length;
    const visualPages = pages.filter((page) => page.kind === 'visual').length;
    const blankPages = pages.filter((page) => page.kind === 'blank').length;
    const warnings = [
      ...baseWarnings(pages, input.options),
      ...reconstructed.warnings,
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

export function inferPublicationMetadata(
  text: string,
  info?: object,
): PublicationMetadata {
  const normalized = text.replace(/\r/gu, '');
  const rawIsbn = normalized.match(/\bISBN(?:-1[03])?\s*:?[\s\u00a0]*((?:97[89][\s-]*)?[\dXx](?:[\dXx\s-]{8,20})[\dXx])\b/u)?.[1] ?? '';
  const isbn = rawIsbn.replace(/[^\dXx]/gu, '').toUpperCase();
  const translator = firstCapture(normalized, [
    /tradu[cç][aã]o\s+de\s+(.+?)(?=\s+\d+[ªº]?\s+edi[cç][aã]o|\s+EDITORA\b|\n)/iu,
    /;\s*tradu[cç][aã]o\s+(.+?)(?=\.\s*-\s*\d|\n)/iu,
    /translated\s+by\s+(.+?)(?=\n|\s+\d{4}\b)/iu,
  ]);
  const publisher = inferPublisher(normalized);
  const publicationDate = normalized.match(/(?:copyright|©)\s*(?:©\s*)?(19\d{2}|20\d{2})/iu)?.[1]
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

function inferPublisher(text: string): string {
  const rights = text.match(/(?:adquiridos|publicados?)\s+(?:pela|por)\s+((?:EDITORA\s+)?[\p{L}\d&'’.-]+(?:\s+[\p{L}\d&'’.-]+){0,5}?)(?=\.\s+(?:Rua|Avenida)|,\s+que\b|\n)/iu)?.[1];
  if (rights) return formatPublisher(rights);
  const line = text.split('\n').find((candidate) => /\bEDITORA\s+/u.test(candidate));
  if (!line) return '';
  const after = line.slice(line.search(/\bEDITORA\s+/u) + 'EDITORA '.length);
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
  let previewDataUrl: string | undefined;
  if (createPreview || preserveAsImage) {
    const rendered = await renderPageToCanvas(page, kind === 'cover' ? 1.65 : 1.15);
    previewDataUrl = rendered.canvas.toDataURL('image/jpeg', kind === 'cover' ? 0.9 : 0.84);
    releaseCanvas(rendered.canvas);
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
    ...(previewDataUrl ? { previewDataUrl } : {}),
  };
}

function groupItemsIntoLines(items: PdfTextItem[]): PdfLine[] {
  const sorted = [...items].sort((a, b) => {
    const vertical = b.y - a.y;
    return Math.abs(vertical) > Math.max(a.fontSize, b.fontSize) * 0.38 ? vertical : a.x - b.x;
  });
  const lines: Array<{ items: PdfTextItem[]; y: number }> = [];
  for (const item of sorted) {
    const tolerance = Math.max(2.5, item.fontSize * 0.42);
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
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
    for (const item of ordered) {
      const gap = item.x - right;
      if (text && gap > Math.max(1.6, item.fontSize * 0.18)) text += ' ';
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
  const worker = await createWorker(language === 'pt-BR' ? 'por+eng' : 'eng', OEM.LSTM_ONLY, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/tesseract-core-lstm.wasm.js',
    langPath: '/ocr',
    workerBlobURL: false,
    cacheMethod: 'write',
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

function baseWarnings(pages: PdfPageAnalysis[], options: ConverterOptions): ConversionWarning[] {
  const warnings: ConversionWarning[] = [];
  const withoutText = pages.filter((page) => page.kind === 'scanned' && !page.usedOcr);
  if (withoutText.length > 0) {
    warnings.push({
      code: 'PDF_PAGES_WITHOUT_TEXT',
      title: 'Páginas sem texto recuperável',
      detail: `${withoutText.length} página(s) não possui(em) texto nativo${options.enableOcr ? ' e o OCR não recuperou conteúdo suficiente' : ''}.`,
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
    'initializing tesseract': 'inicializando OCR',
    'loading language traineddata': 'carregando idioma',
    'initializing api': 'preparando reconhecimento',
    'recognizing text': 'reconhecendo texto',
  };
  return translations[status] ?? status;
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
