import type { EditableSection, PdfAnalysisResult } from './model';

export interface ReviewFinding {
  code: string;
  title: string;
  reason: string;
  page?: number | undefined;
  sectionIndex?: number | undefined;
  canNormalizeSpaces?: boolean | undefined;
}

export function analyzeReview(
  analysis: PdfAnalysisResult, sections: EditableSection[],
): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const page of analysis.pages) {
    if (page.usedOcr && page.ocrConfidence !== undefined && page.ocrConfidence < 75) {
      findings.push({ code: 'LOW_OCR_CONFIDENCE', title: 'Texto digitalizado com baixa confiança',
        reason: 'Confira nomes, acentos, números e pontuação no texto reconhecido.',
        page: page.pageNumber });
    }
    if (page.columnCount >= 2) {
      findings.push({ code: 'MULTI_COLUMN', title: 'Possível ordem de leitura em colunas',
        reason: 'Revise se a reconstrução seguiu a ordem de leitura correta.',
        page: page.pageNumber });
    }
    if (page.preserveAsImage || (page.kind === 'scanned' && !page.usedOcr)) {
      findings.push({ code: 'IMAGE_ONLY', title: 'Página preservada visualmente',
        reason: 'Talvez esta página não tenha texto selecionável no EPUB.',
        page: page.pageNumber });
    }
  }
  for (const [index, section] of sections.entries()) {
    if (/\uFFFD/u.test(section.plainText)) {
      findings.push({ code: 'UNREADABLE_CHARACTER', title: 'Caractere não reconhecido',
        reason: 'Há um caractere de substituição (�). Corrija manualmente comparando com o PDF.',
        sectionIndex: index });
    }
    if (/(?:^|\S) {3,}\S/mu.test(section.plainText)) {
      findings.push({ code: 'SPACING', title: 'Espaços consecutivos suspeitos',
        reason: 'Pode ser uma quebra artificial de palavras. É possível normalizar os espaços desta seção mediante confirmação.',
        sectionIndex: index, canNormalizeSpaces: true });
    }
    if (/[A-Za-zÀ-ÿ]-\n[A-Za-zÀ-ÿ]/u.test(section.plainText)) {
      findings.push({ code: 'HYPHENATION', title: 'Palavra possivelmente quebrada entre linhas',
        reason: 'Revise manualmente a hifenização. Um hífen pode ser legítimo.',
        sectionIndex: index });
    }
  }
  return findings.slice(0, 60);
}

export function normalizeRepeatedSpaces(text: string): string {
  return text.replace(/ {3,}/gu, ' ');
}
