import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { createIssue } from '../utils/issueFactory';
import { parseXml } from '../utils/xmlUtils';

const HTML_TYPES = new Set(['application/xhtml+xml', 'text/html']);





export function validateEditorialOcrQuality(
  loaded: LoadedEpub,
  pkg: PackageDocumentInfo,
): Issue[] {
  const issues: Issue[] = [];
  const pageLabels = new Map<string, Set<string>>();
  const runningText = new Map<string, Set<string>>();
  for (const item of pkg.manifest) {
    if (!item.exists || !HTML_TYPES.has(item.mediaType)) continue;
    const bytes = loaded.files.get(item.resolvedPath)?.bytes;
    if (!bytes) continue;
    let doc: Document;
    try {
      const markup = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      doc = item.mediaType === 'text/html'
        ? new DOMParser().parseFromString(markup, 'text/html')
        : parseXml(markup.replace(/&nbsp;/giu, '&#160;'));
    } catch {
      continue; 
    }

    const content = Array.from(doc.getElementsByTagName('*'))
      .find((element) => element.localName.toLowerCase() === 'body') ?? doc.documentElement;
    const paragraphs = Array.from(content.getElementsByTagName('*'))
      .filter((element) => element.localName.toLowerCase() === 'p')
      .map((element) => element.textContent ?? '');
    const visible = paragraphs.join('\n');
    
    
    if (paragraphs.length >= 3) {
      for (const [position, value] of [
        ['início', paragraphs[0]],
        ['fim', paragraphs[paragraphs.length - 1]],
      ] as const) {
        const label = (value ?? '').trim().replace(/\s+/gu, ' ');
        if (label.length < 12 || label.length > 80 ||
            label.split(' ').length < 3 || !/[\p{L}]/u.test(label) ||
            /^[—–"“'«]/u.test(label) || /[.!?…]$/u.test(label)) continue;
        const key = position + ': ' + label.toLocaleLowerCase();
        const locations = runningText.get(key) ?? new Set<string>();
        locations.add(item.resolvedPath);
        runningText.set(key, locations);
      }
    }
    
    
    const hardWrapped = paragraphs.filter((paragraph) => {
      const lines = paragraph.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
      return lines.length >= 5 && lines.every((line) => line.length >= 20 &&
        line.length <= 90) && lines.slice(0, -1).every((line) =>
        !/[.!?;:…]$/u.test(line));
    }).length;
    if (hardWrapped >= 2) {
      issues.push(createIssue({
        code: 'CONTENT_OCR_SUSPECT',
        severity: 'info',
        title: 'Possíveis quebras artificiais de linhas de OCR',
        detail: hardWrapped + ' parágrafos extensos contêm várias quebras físicas ' +
          'sem pontuação terminal. Verifique se a diagramação original foi importada como texto.',
        file: item.resolvedPath,
        repairable: false,
      }));
    }
    const replacementChars = (visible.match(/\uFFFD/gu) ?? []).length;
    
    const splitWords = (visible.match(/[\p{L}]{3,}-[ \t]*\r?\n[ \t]*[\p{L}]{3,}/gu) ?? []).length;
    if (replacementChars >= 2 || splitWords >= 3) {
      issues.push(createIssue({
        code: 'CONTENT_OCR_SUSPECT',
        severity: 'info',
        title: 'Possíveis artefatos de OCR no texto',
        detail: replacementChars >= 2
          ? replacementChars + ' caracteres de substituição (�) podem indicar falha de OCR ou decodificação.'
          : splitWords + ' palavras separadas por hífen e quebra de linha exigem conferência editorial.',
        file: item.resolvedPath,
        repairable: false,
      }));
    }

    
    
    const labels = paragraphs.map((p) => p.trim())
      .filter((p) => /^(?:p(?:á|a)g(?:ina)?\.?\s*\d+|page\s*\d+|\d{1,4})$/iu.test(p));
    for (const label of labels) {
      const key = label.replace(/\d+/gu, '#').toLowerCase();
      const locations = pageLabels.get(key) ?? new Set<string>();
      locations.add(item.resolvedPath);
      pageLabels.set(key, locations);
    }
  }

  for (const [label, locations] of runningText) {
    if (locations.size < 3) continue;
    issues.push(createIssue({
      code: 'CONTENT_OCR_SUSPECT',
      severity: 'info',
      title: 'Possível cabeçalho ou rodapé repetido no texto',
      detail: 'A mesma linha aparece no ' + label.split(': ')[0] + ' de ' +
        locations.size + ' capítulos. Pode ser conteúdo editorial legítimo; revise visualmente.',
      context: label.slice(0, 100),
      repairable: false,
    }));
  }

  for (const [format, locations] of pageLabels) {
    if (locations.size < 3) continue;
    issues.push(createIssue({
      code: 'CONTENT_OCR_SUSPECT',
      severity: 'info',
      title: 'Marcadores repetidos de página em documentos distintos',
      detail: 'Há marcadores semelhantes a "' + format + '" em ' + locations.size +
        ' documentos. Podem ser cabeçalhos/rodapés de digitalização; confirmar visualmente.',
      repairable: false,
    }));
  }

  return issues;
}
