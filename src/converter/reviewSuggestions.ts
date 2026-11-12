import type { EditableSection, PdfAnalysisResult } from './model';

export interface ReviewFinding {
  code: string;
  title: string;
  reason: string;
  page?: number | undefined;
  sectionIndex?: number | undefined;
  canNormalizeSpaces?: boolean | undefined;
}

const MAX_FINDINGS = 60;

function relatedSection(sections: EditableSection[], pageNumber: number): number | undefined {
  const match = sections.findIndex((section) => section.sourcePages.includes(pageNumber));
  return match >= 0 ? match : undefined;
}

export function analyzeReview(
  analysis: PdfAnalysisResult, sections: EditableSection[],
): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const page of analysis.pages) {
    const sectionIndex = relatedSection(sections, page.pageNumber);
    if (page.usedOcr && page.ocrConfidence !== undefined &&
        Number.isFinite(page.ocrConfidence) && page.ocrConfidence < 75) {
      findings.push({ code: 'LOW_OCR_CONFIDENCE', title: 'Texto digitalizado com baixa confiança',
        reason: 'Confirme nomes próprios, números, pontuação e acentos comparando com a página original.',
        page: page.pageNumber, sectionIndex });
    }
    if (page.columnCount >= 2) {
      findings.push({ code: 'MULTI_COLUMN', title: 'Possível ordem de leitura em colunas',
        reason: 'Confira se os parágrafos aparecem na sequência correta, especialmente em tabelas.',
        page: page.pageNumber, sectionIndex });
    }
    if (page.preserveAsImage || (page.kind === 'scanned' && !page.usedOcr)) {
      findings.push({ code: 'IMAGE_ONLY', title: 'Página preservada visualmente',
        reason: 'Confira a legibilidade desta página. Talvez ela não tenha texto selecionável no EPUB.',
        page: page.pageNumber, sectionIndex });
    }
  }
  if ((analysis.repeatedMarginLines ?? []).length > 0) {
    findings.push({ code: 'REPEATED_MARGINS', title: 'Cabeçalhos ou rodapés recorrentes',
      reason: 'Foram detectadas linhas que podem representar cabeçalhos/rodapés repetidos. Revise antes de removê-las.' });
  }
  for (const [index, section] of sections.entries()) {
    if (/\uFFFD/u.test(section.plainText)) {
      findings.push({ code: 'UNREADABLE_CHARACTER', title: 'Caractere não reconhecido',
        reason: 'Há um caractere de substituição (�). Corrija manualmente comparando com o PDF.',
        sectionIndex: index, page: section.sourcePages[0] });
    }
    if (/(?:^|\S) {3,}\S/mu.test(section.plainText)) {
      findings.push({ code: 'SPACING', title: 'Espaços consecutivos suspeitos',
        reason: 'Pode ser uma separação artificial de palavras. A normalização exige confirmação explícita.',
        sectionIndex: index, page: section.sourcePages[0], canNormalizeSpaces: true });
    }
    if (/[A-Za-zÀ-ÿ]-\n[A-Za-zÀ-ÿ]/u.test(section.plainText)) {
      findings.push({ code: 'HYPHENATION', title: 'Palavra possivelmente quebrada entre linhas',
        reason: 'Revise manualmente a hifenização, porque o hífen também pode ser legítimo.',
        sectionIndex: index, page: section.sourcePages[0] });
    }
  }
  return findings.slice(0, MAX_FINDINGS);
}

export function normalizeRepeatedSpaces(text: string): string {
  return text.replace(/ {3,}/gu, ' ');
}
