import type { LoadedEpub } from '../model/epubTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { HTML_MEDIA_TYPES, IMAGE_MEDIA_TYPES } from '../utils/constants';
import { stripImageMetadata } from './stripImageMetadata';
import { isJpegMediaType, isProgressiveJpeg } from '../utils/kindleCompatibility';
import { auditVisualStructures, type CoverReferenceApproval } from './editorialStructureAudit';

const textDecoder = new TextDecoder('utf-8', { fatal: false });
const FONT_MIME = /^(?:font\/|application\/(?:font-|vnd\.ms-fontobject))/iu;





export function auditPreservation(
  original: LoadedEpub,
  output: ReadonlyMap<string, Uint8Array>,
  before: PackageDocumentInfo,
  after: PackageDocumentInfo | undefined,
  approvedMetadataCleanup: ReadonlySet<string> = new Set(),
  approvedCoverReplacement?: CoverReferenceApproval,
  approvedJpegConversions: ReadonlySet<string> = new Set(),
  approvedRemoteRemoval = false,
  approvedCoverSvgLabels: ReadonlySet<string> = new Set(),
  approvedNcxCompletion: ReadonlySet<string> = new Set(),
): string[] {
  const warnings: string[] = [];
  const originalPaths = new Set(original.files.keys());
  const finalPaths = new Set(output.keys());
  if (!after) {
    throw new Error('O EPUB gerado não possui estrutura editorial verificável após o reparo.');
  }

  const readingPaths = (pkg: PackageDocumentInfo) => pkg.spine
    .map((item) => item.manifestItem?.resolvedPath || `ausente:${item.idref}`);
  if (readingPaths(before).join('\u0000') !== readingPaths(after).join('\u0000')) {
    warnings.push('A ordem ou a composição do spine mudou: confirme manualmente a sequência dos capítulos.');
  }

  const originalReadingPaths = before.spine
    .map((item) => item.manifestItem)
    .filter((item) => item?.exists)
    .map((item) => item!.resolvedPath);
  const finalReadingPaths = new Set(
    after.spine.map((item) => item.manifestItem?.resolvedPath).filter(Boolean),
  );
  for (const path of originalReadingPaths) {
    if (!output.has(path) || !finalReadingPaths.has(path)) {
      throw new Error(`O reparo perdeu um documento da ordem de leitura: ${path}`);
    }
  }

  
  
  const surviving = after.spine
    .map((item) => item.manifestItem?.resolvedPath)
    .filter((path): path is string => Boolean(path && originalReadingPaths.includes(path)));
  if (surviving.join('\u0000') !== originalReadingPaths.join('\u0000')) {
    throw new Error('A operação alterou a ordem ou repetição de capítulos já existentes.');
  }

  
  
  for (let index = 0; index < before.spine.length; index += 1) {
    const original = before.spine[index];
    const updated = after.spine[index];
    if (original?.manifestItem?.exists && updated?.manifestItem?.resolvedPath ===
        original.manifestItem.resolvedPath && original.linear !== updated.linear) {
      throw new Error('O reparo alteraria a classificação linear de um capítulo existente.');
    }
  }

  warnings.push(...auditNavigationPreservation(original, output, before, approvedNcxCompletion));
  auditMediaOverlayPreservation(original, output, before, after);

  const changedText: string[] = [];
  const potentiallyLostText: string[] = [];
  for (const item of before.manifest) {
    if (!item.exists || !HTML_MEDIA_TYPES.has(item.mediaType)) continue;
    const oldBytes = original.files.get(item.resolvedPath)?.bytes;
    const newBytes = output.get(item.resolvedPath);
    if (!oldBytes) continue;
    if (!newBytes) {
      throw new Error('O reparo removeria um documento editorial declarado: ' + item.resolvedPath);
    }
    
    
    if (item.mediaType === 'application/x-dtbook+xml' && !sameBytes(oldBytes, newBytes)) {
      throw new Error('Reparo bloqueado para preservar integralmente texto e estrutura DTBook em ' + item.resolvedPath);
    }
    const oldMarkup = textDecoder.decode(oldBytes);
    const newMarkup = textDecoder.decode(newBytes);
    if (!sameBytes(oldBytes, newBytes)) {
      compareInternalTargets(oldMarkup, newMarkup, item.resolvedPath, item.mediaType);
      compareEditorialBlocks(oldMarkup, newMarkup, item.resolvedPath, item.mediaType);
      compareSpecialMarkup(oldMarkup, newMarkup, item.resolvedPath, item.mediaType);
      compareTypographyPreservation(oldMarkup, newMarkup, item.resolvedPath, item.mediaType);
      
      auditVisualStructures(oldMarkup, newMarkup, item.resolvedPath, item.mediaType,
        originalPaths, finalPaths, approvedCoverReplacement, !approvedRemoteRemoval,
        approvedCoverSvgLabels.has(item.resolvedPath));
    }
    const oldText = extractReadableText(oldMarkup, item.mediaType);
    const newText = extractReadableText(newMarkup, item.mediaType);
    if (oldText === undefined || newText === undefined) {
      if (!sameBytes(oldBytes, newBytes)) {
        throw new Error('A alteração editorial não pôde ser auditada com segurança em ' +
          item.resolvedPath + '; a cópia modificada foi bloqueada.');
      }
    } else if (oldText !== newText) {
      changedText.push(item.resolvedPath);
      if (!containsOriginalWordsInOrder(oldText, newText)) {
        potentiallyLostText.push(item.resolvedPath);
      }
    }
  }
  
  
  if (potentiallyLostText.length > 0) {
    throw new Error(
      `A correção alteraria ou removeria texto editorial em ${potentiallyLostText.length} arquivo(s): ` +
      potentiallyLostText.slice(0, 5).join(', ') +
      '. O EPUB não foi liberado; revise os capítulos antes de tentar outro reparo.',
    );
  }
  if (changedText.length > 0) {
    warnings.push(
      `Houve acréscimos ou alterações não destrutivas detectáveis em ${changedText.length} documento(s). ` +
      `Revise o texto: ${changedText.slice(0, 5).join(', ')}`,
    );
  }

  
  for (const item of before.manifest) {
    if (!item.exists || !(IMAGE_MEDIA_TYPES.has(item.mediaType) || FONT_MIME.test(item.mediaType))) {
      continue;
    }
    const oldBytes = original.files.get(item.resolvedPath)?.bytes;
    const newBytes = output.get(item.resolvedPath);
    if (!oldBytes) continue;
    if (!newBytes) {
      throw new Error('O reparo removeria uma imagem ou fonte editorial declarada: ' + item.resolvedPath);
    }
    if (!sameBytes(oldBytes, newBytes)) {
      if (item.mediaType === 'image/svg+xml') {
        compareSvgPreservation(textDecoder.decode(oldBytes), textDecoder.decode(newBytes),
          item.resolvedPath);
      } else {
        const approvedCover = approvedCoverReplacement?.path === item.resolvedPath &&
          sameBytes(approvedCoverReplacement.bytes, newBytes);
        const approvedMetadata = approvedMetadataCleanup.has(item.resolvedPath) &&
          sameBytes(stripImageMetadata(oldBytes, item.mediaType).bytes, newBytes);
        const approvedJpeg = approvedJpegConversions.has(item.resolvedPath) &&
          isJpegMediaType(item.mediaType) && isProgressiveJpeg(oldBytes) &&
          !isProgressiveJpeg(newBytes);
        if (!approvedCover && !approvedMetadata && !approvedJpeg) {
          throw new Error(`O reparo técnico modificou um recurso binário sem autorização: ${item.resolvedPath}`);
        }
      }
    }
  }
  return warnings;
}







function auditMediaOverlayPreservation(
  original: LoadedEpub,
  output: ReadonlyMap<string, Uint8Array>,
  before: PackageDocumentInfo,
  after: PackageDocumentInfo,
): void {
  const outputByPath = new Map(after.manifest.map((item) => [item.resolvedPath, item]));
  for (const item of before.manifest) {
    if (!item.exists) continue;
    const current = outputByPath.get(item.resolvedPath);
    if (item.mediaOverlay && current?.mediaOverlay !== item.mediaOverlay) {
      throw new Error('O reparo alteraria o vínculo editorial entre conteúdo e Media Overlay: ' +
        item.resolvedPath);
    }
    if (item.mediaType !== 'application/smil+xml') continue;
    const was = original.files.get(item.resolvedPath)?.bytes;
    const now = output.get(item.resolvedPath);
    if (!was || !now || !sameBytes(was, now)) {
      throw new Error('O reparo alteraria bytes de sincronização SMIL sem autorização: ' +
        item.resolvedPath);
    }
  }
}

function extractReadableText(markup: string, mediaType = 'application/xhtml+xml'): string | undefined {
  const document = parseReadableDocument(markup, mediaType);
  if (!document) return undefined;
  for (const element of Array.from(document.getElementsByTagName('*'))) {
    if (element.localName === 'script' || element.localName === 'style') element.remove();
  }
  const body = Array.from(document.getElementsByTagName('*'))
    .find((element) => element.localName === 'body');
  return (body?.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
  return true;
}




function containsOriginalWordsInOrder(before: string, after: string): boolean {
  const originalWords = before.trim().split(/\s+/u).filter(Boolean);
  if (originalWords.length === 0) return true;
  const afterWords = after.trim().split(/\s+/u).filter(Boolean);
  let cursor = 0;
  for (const word of afterWords) {
    if (word === originalWords[cursor]) cursor += 1;
    if (cursor === originalWords.length) return true;
  }
  return false;
}






function compareEditorialBlocks(before: string, after: string, path: string,
  mediaType = 'application/xhtml+xml'): void {
  const original = parseReadableDocument(before, mediaType);
  const repaired = parseReadableDocument(after, mediaType);
  if (!original || !repaired) return;
  const blocks = (doc: Document) => Array.from(doc.getElementsByTagName('*'))
    .filter((element) => /^(?:p|li|h[1-6])$/iu.test(element.localName))
    .map((element) => (element.textContent ?? '').replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
  const beforeBlocks = blocks(original);
  const afterBlocks = blocks(repaired);
  let cursor = 0;
  for (const block of beforeBlocks) {
    while (cursor < afterBlocks.length &&
      !containsOriginalWordsInOrder(block, afterBlocks[cursor] ?? '')) cursor += 1;
    if (cursor >= afterBlocks.length) {
      throw new Error(`O reparo alteraria texto editorial: apagaria, fundiria ou mudaria a ordem de blocos editoriais em ${path}.`);
    }
    cursor += 1;
  }
}

 






function compareTypographyPreservation(before: string, after: string, path: string,
  mediaType = 'application/xhtml+xml'): void {
  const oldDoc = parseReadableDocument(before, mediaType);
  const newDoc = parseReadableDocument(after, mediaType);
  if (!oldDoc || !newDoc) return;
  const typographic = /^(?:em|i|strong|b|u|s|small|sup|sub|span|cite|q|blockquote|pre|code|br|wbr)$/iu;
  const nodes = (doc: Document) => Array.from(doc.getElementsByTagName('*'))
    .filter((element) => typographic.test(element.localName))
    
    .filter((element) => !Array.from(element.getElementsByTagName('*')).some((node) =>
      ['script', 'style', 'iframe', 'object'].includes(node.localName.toLowerCase())));
  const original = nodes(oldDoc);
  const output = nodes(newDoc);
  let index = 0;
  for (const element of original) {
    const name = element.localName;
    const lang = element.getAttribute('lang') ?? element.getAttribute('xml:lang') ?? '';
    const originalClass = element.getAttribute('class') ?? '';
    const originalStyle = element.getAttribute('style')?.trim() ?? '';
    const text = (element.textContent ?? '').replace(/\s+/gu, ' ').trim();
    const exactPre = /^(?:pre|code)$/iu.test(name);
    
    
    const protectStyle = originalStyle && !/(?:url\s*\(|@import|expression\s*\()/iu.test(originalStyle);
    let found = false;
    for (; index < output.length; index += 1) {
      const candidate = output[index]!;
      if (candidate.localName !== name ||
          (candidate.getAttribute('lang') ?? candidate.getAttribute('xml:lang') ?? '') !== lang ||
          (candidate.getAttribute('class') ?? '') !== originalClass ||
          (protectStyle && candidate.getAttribute('style')?.trim() !== originalStyle)) {
        continue;
      }
      const afterText = (candidate.textContent ?? '').replace(/\s+/gu, ' ').trim();
      if ((exactPre && candidate.textContent !== element.textContent) ||
          (!exactPre && !containsOriginalWordsInOrder(text, afterText))) continue;
      found = true;
      index += 1;
      break;
    }
    if (!found) {
      throw new Error('O reparo removeria formatação, ênfase, espaçamento ou ' +
        'quebra de verso editorial em ' + path + ' (' + name + ').');
    }
  }
}

function compareInternalTargets(before: string, after: string, path: string,
  mediaType = 'application/xhtml+xml'): void {
  const original = parseReadableDocument(before, mediaType);
  const output = parseReadableDocument(after, mediaType);
  if (!original || !output) return; 
  const elements = (doc: Document): Element[] => Array.from(doc.getElementsByTagName('*'))
    .filter((element) => element.localName !== 'script' && element.localName !== 'style');
  const ids = (doc: Document) => new Set(elements(doc)
    .flatMap((element) => [
      element.getAttribute('id'),
      element.localName === 'a' ? element.getAttribute('name') : null,
    ]).filter((value): value is string => Boolean(value)));
  const originalIds = ids(original);
  const afterIds = ids(output);
  for (const id of originalIds) {
    if (!afterIds.has(id)) {
      throw new Error(`O reparo removeria uma âncora editorial (${id}) em ${path}.`);
    }
  }
  const links = (doc: Document) => new Set(elements(doc)
    .filter((element) => element.localName === 'a')
    .map((element) => element.getAttribute('href') ?? '')
    .filter((href) => Boolean(href) && (
      href.startsWith('#') || (!/^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(href) &&
        !href.startsWith('kindle:embed:'))
    )));
  const remaining = links(output);
  for (const href of links(original)) {
    if (!remaining.has(href)) {
      throw new Error(`O reparo removeria uma remissão interna (${href}) em ${path}.`);
    }
  }
}

function parseReadableDocument(markup: string,
  mediaType = 'application/xhtml+xml'): Document | undefined {
  if (typeof DOMParser === 'undefined') return undefined;
  
  
  const isHtml = mediaType === 'text/html';
  const doc = new DOMParser().parseFromString(
    isHtml ? markup : markup.replace(/&nbsp;/giu, '&#160;'),
    isHtml ? 'text/html' : 'application/xhtml+xml',
  );
  return !isHtml && doc.getElementsByTagName('parsererror').length > 0 ? undefined : doc;
}







function orderedSubsequence(original: string[], updated: string[]): boolean {
  let index = 0;
  for (const value of updated) {
    if (index < original.length && original[index] === value) index += 1;
  }
  return index === original.length;
}

function auditNavigationPreservation(
  original: LoadedEpub,
  output: ReadonlyMap<string, Uint8Array>,
  before: PackageDocumentInfo,
  approvedNcxCompletion: ReadonlySet<string>,
): string[] {
  const notes: string[] = [];
  for (const item of [before.navItem, before.ncxItem]) {
    if (!item?.exists) continue;
    const oldBytes = original.files.get(item.resolvedPath)?.bytes;
    const newBytes = output.get(item.resolvedPath);
    if (!oldBytes || !newBytes) {
      throw new Error('O reparo removeria um arquivo de navegação existente: ' + item.resolvedPath);
    }
    if (sameBytes(oldBytes, newBytes)) continue;
    const oldDoc = parseReadableDocument(textDecoder.decode(oldBytes));
    const newDoc = parseReadableDocument(textDecoder.decode(newBytes));
    if (!oldDoc || !newDoc) {
      throw new Error('O índice mudou, mas não pôde ser comparado com segurança em ' +
        item.resolvedPath + '. A cópia foi bloqueada.');
    }
    const allowNcxAdditions = item.mediaType === 'application/x-dtbncx+xml' &&
      approvedNcxCompletion.has(item.resolvedPath);
    const oldComparable = oldDoc;
    const targets = (doc: Document): string[] => Array.from(doc.getElementsByTagName('*'))
      .flatMap((node) => {
        if (node.localName === 'a') return [node.getAttribute('href') ?? ''];
        if (node.localName === 'content') return [node.getAttribute('src') ?? ''];
        return [];
      }).filter(Boolean);
    const oldTargets = targets(oldComparable);
    const newTargets = targets(newDoc);
    if (!(allowNcxAdditions
      ? orderedSubsequence(oldTargets, newTargets)
      : oldTargets.join('\u0000') === newTargets.join('\u0000'))) {
      throw new Error('O reparo alteraria destinos ou ordem do sumário em ' + item.resolvedPath);
    }
    
    
    
    if (item === before.navItem) {
      const previous = epubNavSemanticFingerprint(oldDoc);
      const current = epubNavSemanticFingerprint(newDoc);
      if (previous.join('\u0000') !== current.join('\u0000')) {
        throw new Error('O reparo alteraria a hierarquia, semântica ou os rótulos ' +
          'editoriais do índice EPUB 3 em ' + item.resolvedPath);
      }
    }
    if (item.mediaType === 'application/x-dtbncx+xml') {
      const fingerprint = (doc: Document) => Array.from(doc.getElementsByTagName('*'))
        .filter((node) => node.localName === 'navPoint')
        .map((node) => {
          let depth = 0;
          for (let parent = node.parentElement; parent; parent = parent.parentElement) {
            if (parent.localName === 'navPoint') depth += 1;
          }
          const label = Array.from(node.children).find((child) => child.localName === 'navLabel');
          const text = label && Array.from(label.children)
            .find((child) => child.localName === 'text')?.textContent?.replace(/\s+/gu, ' ').trim();
          return JSON.stringify([depth, node.getAttribute('id') ?? '', text ?? '']);
        });
      const oldFingerprint = fingerprint(oldComparable);
      const newFingerprint = fingerprint(newDoc);
      if (!(allowNcxAdditions
        ? orderedSubsequence(oldFingerprint, newFingerprint)
        : oldFingerprint.join('\u0000') === newFingerprint.join('\u0000'))) {
        throw new Error('O reparo alteraria a hierarquia, IDs ou títulos editoriais do NCX em ' +
          item.resolvedPath);
      }
    }
  }
  return notes;
}






function epubNavSemanticFingerprint(doc: Document): string[] {
  const xhtmlNamespace = 'http://www.w3.org/1999/xhtml';
  const epubNamespace = 'http://www.idpf.org/2007/ops';
  const semantic = new Set(['ol', 'li', 'a', 'span']);
  const semanticValue = (node: Element): string => {
    const clone = node.cloneNode(true) as Element;
    for (const element of Array.from(clone.getElementsByTagName('*'))) {
      if (['script', 'style', 'iframe', 'object', 'embed'].includes(
        element.localName.toLowerCase())) element.remove();
    }
    return (clone.textContent ?? '').replace(/\s+/gu, ' ').trim();
  };
  const nodes = Array.from(doc.getElementsByTagName('*')).filter(
    node => node.localName === 'nav' && node.namespaceURI === xhtmlNamespace);
  return nodes.map((nav) => {
    const epubType = (node: Element): string => node.getAttributeNS(epubNamespace, 'type')
      ?? node.getAttribute('epub:type') ?? '';
    const meta = [
      epubType(nav), nav.getAttribute('id') ?? '',
      nav.getAttribute('role') ?? '', nav.getAttribute('aria-label') ?? '',
      nav.getAttribute('aria-labelledby') ?? '', nav.hasAttribute('hidden'),
    ];
    const descendants = Array.from(nav.getElementsByTagName('*'))
      .filter(node => semantic.has(node.localName))
      .map(node => {
        const ancestry: string[] = [];
        for (let parent = node.parentElement; parent && parent !== nav;
          parent = parent.parentElement) {
          if (semantic.has(parent.localName)) ancestry.push(parent.localName);
        }
        ancestry.reverse();
        return JSON.stringify([
          ancestry, node.localName, node.getAttribute('id') ?? '',
          node.getAttribute('href') ?? '', epubType(node),
          node.getAttribute('role') ?? '',
          node.getAttribute('aria-label') ?? '',
          node.getAttribute('aria-labelledby') ?? '',
          node.getAttribute('title') ?? '',
          node.getAttribute('class') ?? '',
          node.getAttribute('start') ?? '', node.hasAttribute('reversed'),
          ['a', 'span'].includes(node.localName) ? semanticValue(node) : '',
        ]);
      });
    return JSON.stringify([meta, descendants]);
  });
}






function compareSpecialMarkup(before: string, after: string, path: string,
  mediaType = 'application/xhtml+xml'): void {
  const oldDoc = parseReadableDocument(before, mediaType);
  const newDoc = parseReadableDocument(after, mediaType);
  if (!oldDoc || !newDoc) return;
  const semantic = (doc: Document): string[] => Array.from(doc.getElementsByTagName('*'))
    .filter((node) => ['math', 'mrow', 'mi', 'mn', 'mo', 'msup', 'msub', 'mfrac',
      'ruby', 'rb', 'rt', 'rp', 'rtc', 'bdo', 'bdi'].includes(node.localName))
    .map((node) => [
      node.namespaceURI ?? '',
      node.localName,
      node.getAttribute('dir') ?? '',
      (node.textContent ?? '').replace(/\s+/gu, ' ').trim(),
    ].join('|'));
  if (semantic(oldDoc).join('\u0000') !== semantic(newDoc).join('\u0000')) {
    throw new Error('O reparo alteraria a semântica MathML/ruby/RTL em ' + path);
  }
  const directional = (doc: Document) => Array.from(doc.getElementsByTagName('*'))
    .filter((node) => Boolean(node.getAttribute('dir')?.trim()))
    .map((node) => node.localName + '|' + node.getAttribute('dir'));
  const beforeDirections = directional(oldDoc);
  const afterDirections = directional(newDoc);
  for (const direction of beforeDirections) {
    if (!afterDirections.includes(direction)) {
      throw new Error('O reparo perderia uma direção de leitura explícita em ' + path);
    }
  }

  
  
  
  const readingMarkers = (doc: Document): string[] =>
    Array.from(doc.getElementsByTagName('*'))
      .filter((node) => !['script', 'style', 'iframe', 'object', 'embed']
        .includes(node.localName.toLowerCase()))
      .flatMap((node) => {
        const rawLang = node.getAttribute('lang') ?? '';
        const rawXmlLang = node.getAttributeNS(
          'http://www.w3.org/XML/1998/namespace', 'lang',
        ) ?? '';
        
        
        const lang = rawLang || rawXmlLang;
        const xmlLang = rawXmlLang || rawLang;
        const dir = node.getAttribute('dir') ?? '';
        const writingMode = (node.getAttribute('style') ?? '')
          .match(/(?:^|;)\s*(?:-epub-|-webkit-)?writing-mode\s*:\s*([^;}]*)/iu)?.[1]
          ?.trim().toLowerCase() ?? '';
        const mathVariant = node.getAttribute('mathvariant') ?? '';
        const mathDisplay = node.localName === 'math'
          ? (node.getAttribute('display') ?? '') : '';
        if (!lang && !xmlLang && !dir && !writingMode &&
            !mathVariant && !mathDisplay) return [];
        return [JSON.stringify([
          node.namespaceURI, node.localName, lang, xmlLang, dir,
          writingMode, mathVariant, mathDisplay,
        ])];
      });
  const beforeMarkers = readingMarkers(oldDoc);
  const afterMarkers = readingMarkers(newDoc);
  let cursor = 0;
  for (const marker of beforeMarkers) {
    const index = afterMarkers.indexOf(marker, cursor);
    if (index < 0) {
      throw new Error('O reparo alteraria idioma misto, variante matemática ' +
        'ou modo de escrita vertical em ' + path);
    }
    cursor = index + 1;
  }
}







function compareSvgPreservation(before: string, after: string, path: string): void {
  const original = parseReadableDocument(before);
  const repaired = parseReadableDocument(after);
  if (!original || !repaired || original.documentElement.localName !== 'svg' ||
      repaired.documentElement.localName !== 'svg') {
    throw new Error('SVG alterado não pode ser auditado com segurança: ' + path);
  }
  const active = new Set(['script', 'foreignobject', 'iframe', 'embed', 'object',
    'animate', 'animatetransform', 'animatemotion', 'set', 'applet', 'portal',
    'frame', 'frameset']);
  const signature = (doc: Document): string[] =>
    Array.from(doc.getElementsByTagName('*'))
      .filter((node) => !active.has(node.localName.toLowerCase()))
      .map((node) => {
        const attrs = Array.from(node.attributes)
          .filter((attr) => !attr.name.toLowerCase().startsWith('on') &&
            !['style', 'href', 'xlink:href', 'src', 'data'].includes(attr.name.toLowerCase()))
          .map((attr) => [attr.name, attr.value])
          .sort((left, right) => (left[0] ?? '').localeCompare(right[0] ?? ''));
        const visible = node.localName === 'text' || node.localName === 'tspan'
          ? (node.textContent ?? '').replace(/\s+/gu, ' ').trim() : '';
        return JSON.stringify([node.namespaceURI, node.localName, attrs, visible]);
      });
  if (signature(original).join('\u0000') !== signature(repaired).join('\u0000')) {
    throw new Error('O reparo de SVG alteraria texto, geometria ou IDs editoriais em ' + path);
  }
}
