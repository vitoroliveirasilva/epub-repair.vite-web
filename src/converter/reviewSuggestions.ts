import type { EditableSection, PdfAnalysisResult } from './model';

export type ReviewPriority = 'high' | 'medium' | 'low';

export interface ReviewFinding {
  code: string;
  title: string;
  reason: string;
  priority: ReviewPriority;
  page?: number | undefined;
  sectionIndex?: number | undefined;
  evidence?: string | undefined;
  canNormalizeSpaces?: boolean | undefined;
}

const MAX_FINDINGS = 60;
const MAX_EXCERPT = 110;
const priorities: Record<ReviewPriority, number> = { high: 0, medium: 1, low: 2 };

function snippet(text: string, index = 0): string | undefined {
  const clean = text.replace(/\s+/gu, ' ').trim();
  if (!clean) return undefined;
  const start = Math.max(0, index - 35);
  const clipped = clean.slice(start, start + MAX_EXCERPT);
  return (start ? '…' : '') + clipped + (clean.length > start + MAX_EXCERPT ? '…' : '');
}

function hasLikelyTableGrid(page: PdfAnalysisResult['pages'][number]): boolean {
  if (!Number.isFinite(page.width) || page.width <= 0) return false;
  const cells = page.lines.slice(0, 400).filter((line) => line.text.trim().length > 0 &&
    line.width > 0 && line.width < page.width * 0.3);
  const rowCenters: Array<{ y: number; cells: typeof cells }> = [];
  for (const cell of cells) {
    const row = rowCenters.find((entry) => Math.abs(entry.y - cell.y) <=
      Math.max(4, cell.fontSize * 0.45));
    if (row) row.cells.push(cell);
    else rowCenters.push({ y: cell.y, cells: [cell] });
  }
  return rowCenters.filter((row) => {
    const x = [...new Set(row.cells.map((cell) => Math.round(cell.x / 20) * 20))]
      .sort((a, b) => a - b);
    return x.length >= 3 && x[x.length - 1]! - x[0]! >= page.width * 0.4;
  }).length >= 3;
}

function normalizedContent(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '')
    .toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function sectionContentByPage(sections: EditableSection[]): Map<number, string> {
  const result = new Map<number, string>();
  for (const section of sections) {
    const content = normalizedContent(section.plainText);
    for (const page of section.sourcePages) {
      result.set(page, (result.get(page) ?? '') + content);
    }
  }
  return result;
}

function likelyMissingLines(
  page: PdfAnalysisResult['pages'][number], convertedText: string,
): string | undefined {
  if (page.preserveAsImage || page.kind !== 'text' || !convertedText ||
    page.lines.length < 6) return undefined;
  const candidates = page.lines.filter((line) =>
    line.text.trim().length >= 32 && !line.text.trimEnd().endsWith('-') &&
    line.y >= page.height * 0.12 && line.y <= page.height * 0.88).slice(0, 100);
  if (candidates.length < 6) return undefined;
  const stride = Math.max(1, Math.ceil(candidates.length / 12));
  const sampled = candidates.filter((_, index) => index % stride === 0);
  const missing = sampled.filter((line) => {
    const comparable = normalizedContent(line.text);
    return comparable.length >= 25 && !convertedText.includes(comparable);
  });
  if (missing.length >= 5 && missing.length >= sampled.length * 0.65) {
    return missing[0]?.text;
  }
  return undefined;
}

function relatedSection(sections: EditableSection[], pageNumber: number): number | undefined {
  const match = sections.findIndex((section) => section.sourcePages?.includes(pageNumber));
  return match >= 0 ? match : undefined;
}

function finding(
  code: string, title: string, reason: string, priority: ReviewPriority,
  page?: number, sectionIndex?: number, evidence?: string,
  canNormalizeSpaces?: boolean,
): ReviewFinding {
  return { code, title, reason, priority,
    ...(page !== undefined ? { page } : {}),
    ...(sectionIndex !== undefined ? { sectionIndex } : {}),
    ...(evidence ? { evidence } : {}),
    ...(canNormalizeSpaces ? { canNormalizeSpaces: true } : {}),
  };
}

export function analyzeReview(
  analysis: PdfAnalysisResult, sections: EditableSection[],
): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const byPage = sectionContentByPage(sections);
  for (const page of analysis.pages) {
    const sectionIndex = relatedSection(sections, page.pageNumber);
    const sourceExcerpt = snippet(page.text || '');
    const missingLine = likelyMissingLines(page, byPage.get(page.pageNumber) ?? '');
    if (missingLine) {
      findings.push(finding(
        'POSSIBLE_TEXT_LOSS', 'Possível conteúdo ausente após reconstrução',
        'Várias linhas do PDF não foram encontradas no texto editável desta página. ' +
          'Isso pode ocorrer após reordenação, edição manual ou reconstrução incompleta. ' +
          'Confira o trecho no PDF antes de baixar o EPUB.',
        'high', page.pageNumber, sectionIndex, snippet(missingLine),
      ));
    }
    if (page.usedOcr && page.ocrConfidence !== undefined &&
      Number.isFinite(page.ocrConfidence) && page.ocrConfidence < 75) {
      const confidence = Math.max(0, Math.min(100, page.ocrConfidence));
      findings.push(finding(
        'LOW_OCR_CONFIDENCE',
        'Reconhecimento do texto precisa de revisão',
        'Confiança estimada de ' + Math.round(confidence) +
          '%. Confira nomes, números, pontuação e acentos na página original.',
        confidence < 60 ? 'high' : 'medium', page.pageNumber, sectionIndex, sourceExcerpt,
      ));
    }
    if (hasLikelyTableGrid(page)) {
      findings.push(finding(
        'TABLE_LAYOUT', 'Possível tabela com colunas e linhas',
        'Foi identificada uma grade textual. O EPUB ajustável pode perder alinhamento, ' +
          'cabeçalhos e associação entre células. Confira a página e considere layout fixo ' +
          'para preservar a apresentação visual.',
        'medium', page.pageNumber, sectionIndex, sourceExcerpt,
      ));
    }
    if (page.columnCount >= 2) {
      findings.push(finding(
        'MULTI_COLUMN', 'Possível ordem de leitura incorreta',
        'A página contém várias colunas. Confira se a leitura segue a ordem dos parágrafos.',
        'medium', page.pageNumber, sectionIndex,
      ));
    }
    if (page.preserveAsImage || (page.kind === 'scanned' && !page.usedOcr)) {
      findings.push(finding(
        'IMAGE_ONLY', 'Página sem texto refluível',
        'A página pode aparecer como imagem no EPUB. Confira legibilidade e seleção do texto.',
        page.kind === 'scanned' && !page.usedOcr ? 'high' : 'medium',
        page.pageNumber, sectionIndex,
      ));
    }
    if (page.text?.trim().length >= 240 && sectionIndex === undefined &&
      !page.preserveAsImage && page.kind === 'text') {
      findings.push(finding(
        'PAGE_NOT_LINKED', 'Página não vinculada ao conteúdo convertido',
        'Esta página contém texto no PDF, mas não foi associada a uma seção editável. ' +
          'Confira se era um sumário/rodapé técnico ou se faltou conteúdo no EPUB.',
        'high', page.pageNumber, undefined, sourceExcerpt,
      ));
    }
  }
  if ((analysis.repeatedMarginLines ?? []).length > 0) {
    findings.push(finding(
      'REPEATED_MARGINS', 'Cabeçalhos ou rodapés recorrentes',
      'Linhas repetidas foram identificadas e podem ter sido excluídas pelas opções ' +
        'de conversão. Compare a origem antes de aceitar o resultado.',
      'low', undefined, undefined,
      snippet(analysis.repeatedMarginLines.slice(0, 3).join(' · ')),
    ));
  }
  for (const [index, section] of sections.entries()) {
    const source = section.plainText ?? '';
    const firstPage = section.sourcePages?.[0];
    const invalid = source.indexOf('\uFFFD');
    if (invalid >= 0) {
      findings.push(finding(
        'UNREADABLE_CHARACTER', 'Caractere não reconhecido',
        'O texto contém o símbolo de substituição (�). Confira a palavra no PDF original.',
        'high', firstPage, index, snippet(source, invalid),
      ));
    }
    const spaces = /(?:^|\S) {3,}\S/mu.exec(source);
    if (spaces) {
      findings.push(finding(
        'SPACING', 'Espaços consecutivos suspeitos',
        'O texto contém três ou mais espaços seguidos. A correção é opcional e ' +
          'preserva a formatação HTML existente.',
        'low', firstPage, index, snippet(source, spaces.index), true,
      ));
    }
    const broken = /[A-Za-zÀ-ÿ]-\n[A-Za-zÀ-ÿ]/u.exec(source);
    if (broken) {
      findings.push(finding(
        'HYPHENATION', 'Palavra possivelmente quebrada entre linhas',
        'Confira se o hífen é parte da palavra ou apenas uma quebra física de linha.',
        'medium', firstPage, index, snippet(source, broken.index),
      ));
    }
  }
  return findings
    .sort((a, b) => priorities[a.priority] - priorities[b.priority] ||
      (a.page ?? Number.MAX_SAFE_INTEGER) - (b.page ?? Number.MAX_SAFE_INTEGER) ||
      a.code.localeCompare(b.code))
    .slice(0, MAX_FINDINGS);
}

export function normalizeRepeatedSpaces(text: string): string {
  return text.replace(/ {3,}/gu, ' ');
}

export function normalizeHtmlTextSpaces(html: string): string {
  let result = '';
  let textStart = 0;
  let tagStart = 0;
  let quote = '';
  let skipDepth = 0;
  for (let i = 0; i < html.length; i += 1) {
    const char = html[i]!;
    if (tagStart === 0 && char === '<') {
      result += skipDepth ? html.slice(textStart, i)
        : normalizeRepeatedSpaces(html.slice(textStart, i));
      textStart = i;
      tagStart = i + 1;
      quote = '';
    } else if (tagStart !== 0) {
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '>') {
        const tag = html.slice(tagStart, i);
        if (/^\s*\/?\s*(pre|code|textarea|style|script)\b/iu.test(tag)) {
          const closing = /^\s*\//u.test(tag);
          if (closing) skipDepth = Math.max(0, skipDepth - 1);
          else if (!/\/\s*$/u.test(tag)) skipDepth += 1;
        }
        result += html.slice(textStart, i + 1);
        textStart = i + 1;
        tagStart = 0;
      }
    }
  }
  const tail = html.slice(textStart);
  result += tagStart || skipDepth ? tail : normalizeRepeatedSpaces(tail);
  return result;
}

export function normalizeSectionSpaces(section: EditableSection): EditableSection {
  const normalizedText = normalizeRepeatedSpaces(section.plainText);
  if (normalizedText === section.plainText) return section;
  return { ...section,
    plainText: normalizedText,
    html: normalizeHtmlTextSpaces(section.html),
  };
}
