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
      const needsOcr = pageAnalysis.nativeCharacters < 35;
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
    }
    input.onProgress?.({
      phase: 'Reconstruindo capítulos e parágrafos',
      completed: document.numPages,
      total: document.numPages,
    });
    const fallbackTitle = input.fileName.replace(/\.pdf$/iu, '').trim() || 'Documento convertido';
    const title = metadataString(metadata?.info, 'Title') || fallbackTitle;
    const author = metadataString(metadata?.info, 'Author');
    const reconstructed = reconstructDocument(pages, input.options, title);
    const nativeTextPages = pages.filter((page) => page.nativeCharacters >= 35).length;
    const ocrPages = pages.filter((page) => page.usedOcr).length;
    const scannedPages = pages.length - nativeTextPages;
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
      pages,
      sections: reconstructed.sections,
      warnings,
      suggestedLayout,
      nativeTextPages,
      ocrPages,
      scannedPages,
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
      const rendered = await renderPageToCanvas(page, 1.7);
      const blob = await canvasToBlob(rendered.canvas, 'image/jpeg', 0.9);
      await onPage(index, document.numPages, blob, rendered.width, rendered.height);
      page.cleanup();
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
  const previewDataUrl = createPreview
    ? (await renderPageToCanvas(page, 1.15)).canvas.toDataURL('image/jpeg', 0.84)
    : undefined;
  return {
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    lines,
    text,
    nativeCharacters: text.replace(/\s/gu, '').length,
    usedOcr: false,
    columnCount: detectColumnCount(lines, viewport.width),
    imageCount,
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
  const withoutText = pages.filter((page) => page.nativeCharacters < 35 && !page.usedOcr);
  if (withoutText.length > 0) {
    warnings.push({
      code: 'PDF_PAGES_WITHOUT_TEXT',
      title: 'Páginas sem texto recuperável',
      detail: `${withoutText.length} página(s) não possui(em) texto nativo${options.enableOcr ? ' e o OCR não recuperou conteúdo suficiente' : ''}.`,
      severity: 'warning',
    });
  }
  const imageRich = pages.filter((page) => page.imageCount >= 3).length;
  if (imageRich > 0) {
    warnings.push({
      code: 'PDF_IMAGE_RICH_PAGES',
      title: 'Documento com páginas visuais',
      detail: `${imageRich} página(s) contém(êm) várias imagens. O modo visual preserva melhor essa apresentação.`,
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
  const weakPages = pages.filter((page) =>
    page.nativeCharacters < 35 && (!page.usedOcr || (page.ocrConfidence ?? 0) < 68)).length;
  const imageRich = pages.filter((page) => page.imageCount >= 3).length;
  const multiColumn = warnings.some((warning) => warning.code === 'PDF_MULTIPLE_COLUMNS');
  return weakPages > pages.length * 0.2 ||
    imageRich > pages.length * 0.45 ||
    (options.profile === 'academic' && multiColumn)
    ? 'fixed'
    : 'reflowable';
}

function calculateQualityScore(
  pages: PdfPageAnalysis[],
  warnings: ConversionWarning[],
): number {
  if (pages.length === 0) return 0;
  const readable = pages.filter((page) => page.nativeCharacters >= 35 || page.usedOcr).length;
  const ocrPenalty = pages.reduce((sum, page) =>
    sum + (page.usedOcr ? Math.max(0, 82 - (page.ocrConfidence ?? 0)) * 0.22 : 0), 0);
  const warningPenalty = warnings.filter((warning) => warning.severity === 'warning').length * 2.5;
  return Math.max(0, Math.min(100,
    Math.round((readable / pages.length) * 100 - ocrPenalty - warningPenalty)));
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
