import type { ValidationReport } from '../epub';

export type ConversionProfile = 'book' | 'academic' | 'visual';
export type OutputLayout = 'auto' | 'reflowable' | 'fixed';
export type ConversionLayout = Exclude<OutputLayout, 'auto'>;
export type PdfPageKind = 'cover' | 'text' | 'scanned' | 'visual' | 'blank';

export interface ConverterOptions {
  profile: ConversionProfile;
  outputLayout: OutputLayout;
  language: 'pt-BR' | 'en';
  enableOcr: boolean;
  removeRepeatedMargins: boolean;
  removePageNumbers: boolean;
  dehyphenate: boolean;
  normalizeTypography: boolean;
}

export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  hasEol: boolean;
}

export interface PdfLine {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontName: string;
}

export interface PdfPageAnalysis {
  pageNumber: number;
  width: number;
  height: number;
  lines: PdfLine[];
  text: string;
  nativeCharacters: number;
  usedOcr: boolean;
  ocrConfidence?: number | undefined;
  columnCount: number;
  imageCount: number;
  kind: PdfPageKind;
  preserveAsImage: boolean;
  previewDataUrl?: string | undefined;
}

export interface ConversionWarning {
  code: string;
  title: string;
  detail: string;
  pageNumber?: number | undefined;
  severity: 'warning' | 'info';
}

export interface EditableSection {
  id: string;
  title: string;
  html: string;
  plainText: string;
  sourcePages: number[];
}

export interface PdfAnalysisResult {
  fileName: string;
  fileSize: number;
  pageCount: number;
  title: string;
  author: string;
  pages: PdfPageAnalysis[];
  sections: EditableSection[];
  warnings: ConversionWarning[];
  suggestedLayout: ConversionLayout;
  nativeTextPages: number;
  ocrPages: number;
  scannedPages: number;
  visualPages: number;
  blankPages: number;
  repeatedMarginLines: string[];
  qualityScore: number;
}

export interface ConversionResult {
  fileName: string;
  blob: Blob;
  bytes: Uint8Array;
  layout: ConversionLayout;
  validation: ValidationReport;
  warnings: ConversionWarning[];
}

export interface ConverterState {
  file?: File | undefined;
  bytes?: Uint8Array | undefined;
  analysis?: PdfAnalysisResult | undefined;
  sections: EditableSection[];
  result?: ConversionResult | undefined;
  title: string;
  author: string;
  options: ConverterOptions;
  busy: boolean;
  progress: string;
  progressValue?: number | undefined;
  message?: string | undefined;
  error?: string | undefined;
  selectedPage: number;
  selectedSection: number;
  controller?: AbortController | undefined;
}

export function createInitialConverterState(): ConverterState {
  return {
    sections: [],
    title: '',
    author: '',
    options: {
      profile: 'book',
      outputLayout: 'auto',
      language: 'pt-BR',
      enableOcr: true,
      removeRepeatedMargins: true,
      removePageNumbers: true,
      dehyphenate: true,
      normalizeTypography: true,
    },
    busy: false,
    progress: '',
    selectedPage: 1,
    selectedSection: 0,
  };
}
