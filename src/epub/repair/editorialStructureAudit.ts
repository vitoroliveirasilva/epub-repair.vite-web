import { isRemoteUrl, isSafeExternalLinkUrl, isSafeRemoteResourceUrl, isSafeInlineImageDataUrl, resolveReference, splitSrcsetCandidates } from '../utils/pathUtils';
import { containsDangerousCss } from '../sanitize/sanitizeActiveContent';

export interface CoverReferenceApproval {
  path: string;
  bytes: Uint8Array;
  /** A substituição de referência só é permitida nas páginas de capa aprovadas. */
  previousPath?: string | undefined;
  allowedPages?: ReadonlySet<string> | undefined;
  /** Folhas CSS duplicadas para a capa, sem tocar nos estilos dos capítulos. */
  styleAliases?: ReadonlyMap<string, string> | undefined;
}

type MediaReference = { element: string; attribute: string; target: string };

function parseEditorial(markup: string, mime: string): Document | undefined {
  if (typeof DOMParser === 'undefined') return undefined;
  const html = mime === 'text/html';
  const doc = new DOMParser().parseFromString(
    html ? markup : markup.replace(/&nbsp;/giu, '&#160;'),
    html ? 'text/html' : 'application/xhtml+xml',
  );
  if (!html && doc.getElementsByTagName('parsererror').length > 0) return undefined;
  return doc;
}

function visibleTableCellText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  for (const node of Array.from(clone.getElementsByTagName('*'))) {
    if (['script', 'style', 'iframe', 'object', 'embed'].includes(node.localName.toLowerCase())) {
      node.remove();
    }
  }
  return (clone.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

function containsWordsInOrder(before: string, after: string): boolean {
  const wanted = before.split(/\s+/u).filter(Boolean);
  if (!wanted.length) return true;
  const got = after.split(/\s+/u).filter(Boolean);
  let index = 0;
  for (const word of got) {
    if (word === wanted[index]) index += 1;
    if (index === wanted.length) return true;
  }
  return false;
}

function validateTables(original: Document, repaired: Document, path: string): void {
  const tableTags = new Set(['table', 'caption', 'thead', 'tbody', 'tfoot',
    'tr', 'th', 'td', 'col', 'colgroup']);
  const attrs = ['rowspan', 'colspan', 'scope', 'headers', 'abbr'];
  const tableNodes = (doc: Document) => Array.from(doc.getElementsByTagName('*'))
    .filter((node) => tableTags.has(node.localName.toLowerCase()));
  const oldNodes = tableNodes(original);
  const newNodes = tableNodes(repaired);
  if (oldNodes.length !== newNodes.length) {
    throw new Error('O reparo alteraria a estrutura de tabelas editoriais em ' + path);
  }
  for (let i = 0; i < oldNodes.length; i += 1) {
    const before = oldNodes[i]!;
    const after = newNodes[i]!;
    if (before.localName !== after.localName ||
        attrs.some((attr) => (before.getAttribute(attr) ?? '') !== (after.getAttribute(attr) ?? ''))) {
      throw new Error('O reparo alteraria células, cabeçalhos ou mesclagens de tabelas em ' + path);
    }
    if (['th', 'td', 'caption'].includes(before.localName.toLowerCase()) &&
        !containsWordsInOrder(visibleTableCellText(before), visibleTableCellText(after))) {
      throw new Error('O reparo perderia ou trocaria texto em células de tabelas em ' + path);
    }
  }
}

function embeddedMedia(doc: Document, path: string, knownPaths: ReadonlySet<string>,
  preserveRemote: boolean): MediaReference[] {
  const output: MediaReference[] = [];
  const selectors: Record<string, string[]> = {
    img: ['src', 'srcset'], source: ['src', 'srcset'],
    video: ['src', 'poster'], audio: ['src'], track: ['src'],
    image: ['href', 'xlink:href'], use: ['href', 'xlink:href'],
    link: ['href'], a: ['href'],
  };
  for (const element of Array.from(doc.getElementsByTagName('*'))) {
    const name = element.localName.toLowerCase();
    const attrs = selectors[name];
    if (!attrs) continue;
    if (name === 'link' && !element.getAttribute('rel')?.split(/\s+/u)
      .some((part) => part.toLowerCase() === 'stylesheet')) continue;
    if ((name === 'image' || name === 'use') &&
        element.namespaceURI !== 'http://www.w3.org/2000/svg') continue;
    for (const attr of attrs) {
      const value = element.getAttribute(attr)?.trim();
      if (!value) continue;
      const candidates = attr === 'srcset' ? splitSrcsetCandidates(value) : [value];
      for (const candidate of candidates) {
        const raw = (attr === 'srcset' ? candidate.trim().split(/\s+/u)[0] : candidate) ?? '';
        if (!raw) continue;
        if (raw.startsWith('#')) {
          // SVG <use href="#symbol"> reutiliza um desenho local sem recurso ZIP.
          if (name === 'use' || name === 'image') {
            output.push({ element: name, attribute: attr, target: raw });
          }
          continue;
        }
        // data:imagem segura é parte editorial do livro, não deve sumir ao sanear links.
        if (isSafeInlineImageDataUrl(raw)) {
          output.push({ element: name, attribute: attr, target: raw });
          continue;
        }
        if (isRemoteUrl(raw)) {
          // Recursos HTTP(S) externos e links mailto:/tel: são legítimos.
          // Removê-los silenciosamente é regressão se o usuário não optou por isso.
          if (preserveRemote && (isSafeRemoteResourceUrl(raw) ||
              (name === 'a' && isSafeExternalLinkUrl(raw)))) {
            output.push({ element: name, attribute: attr, target: raw });
          }
          continue;
        }
        const resolved = resolveReference(path, raw);
        if (resolved.safe && knownPaths.has(resolved.path)) {
          output.push({ element: name, attribute: attr, target: resolved.path });
        }
      }
    }
  }
  return output;
}

function validateMedia(original: Document, repaired: Document, path: string,
  oldPaths: ReadonlySet<string>, newPaths: ReadonlySet<string>,
  approval?: CoverReferenceApproval, preserveRemote = true): void {
  const originals = embeddedMedia(original, path, oldPaths, preserveRemote);
  const current = embeddedMedia(repaired, path, newPaths, preserveRemote);
  let index = 0;
  for (const expected of originals) {
    let found = false;
    for (; index < current.length; index += 1) {
      const next = current[index]!;
      const sameLocation = next.target === expected.target;
      const allowedPage = Boolean(approval?.allowedPages?.has(path));
      const approvedCover = Boolean(allowedPage &&
        approval?.previousPath === expected.target && approval.path === next.target);
      const approvedStyle = Boolean(allowedPage && expected.element === 'link' &&
        expected.attribute === 'href' &&
        approval?.styleAliases?.get(expected.target) === next.target);
      if (next.element === expected.element && next.attribute === expected.attribute &&
          (sameLocation || approvedCover || approvedStyle)) {
        found = true;
        index += 1;
        break;
      }
    }
    if (!found) {
      throw new Error('O reparo removeria ou trocaria uma imagem, mídia ou fonte CSS ' +
        'referenciada no conteúdo editorial em ' + path + ' (' + expected.target + ').');
    }
  }
}

const ACTIVE_SVG = new Set(['script', 'foreignobject', 'iframe', 'embed', 'object',
  'animate', 'animatemotion', 'animatetransform', 'set', 'applet', 'portal']);

function svgSignature(svg: Element, ignoreNewRootAccessibleName = false): string {
  const nodes: unknown[] = [];
  const visit = (node: Element): void => {
    if (ACTIVE_SVG.has(node.localName.toLowerCase())) return;
    const attributes = Array.from(node.attributes)
      .filter((attribute) => {
        const name = attribute.name.toLowerCase();
        if (ignoreNewRootAccessibleName && node === svg &&
            (name === 'role' || name === 'aria-label')) return false;
        if (name === 'style') return !containsDangerousCss(attribute.value);
        return !name.startsWith('on') && !name.startsWith('xmlns') &&
          !['href', 'xlink:href', 'src', 'data'].includes(name);
      })
      .map((attr) => [attr.namespaceURI ?? '', attr.localName, attr.value])
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    const readable = ['text', 'tspan'].includes(node.localName) ||
      (node.localName === 'style' && !containsDangerousCss(node.textContent ?? ''));
    nodes.push([node.namespaceURI, node.localName, attributes,
      readable ? (node.textContent ?? '').replace(/\s+/gu, ' ').trim() : '']);
    for (const child of Array.from(node.children)) visit(child);
  };
  visit(svg);
  return JSON.stringify(nodes);
}

function validateInlineSvg(original: Document, repaired: Document, path: string,
  approvedCoverSvgLabel = false): void {
  const svgs = (doc: Document) => Array.from(doc.getElementsByTagName('*'))
    .filter((node) => node.localName === 'svg' &&
      node.namespaceURI === 'http://www.w3.org/2000/svg');
  const before = svgs(original);
  const after = svgs(repaired);
  if (before.length !== after.length) {
    throw new Error('O reparo removeria SVG editorial embutido em ' + path);
  }
  for (let i = 0; i < before.length; i += 1) {
    const oldSvg = before[i]!;
    const newSvg = after[i]!;
    if (svgSignature(oldSvg) === svgSignature(newSvg)) continue;
    // A única exceção é a otimização explicitamente registrada do rótulo
    // de capa. Todas as demais propriedades, nós e estruturas ainda precisam
    // ser idênticos. Uma alteração de label preexistente também é bloqueada.
    const allowedLabel = approvedCoverSvgLabel &&
      !oldSvg.hasAttribute('aria-label') &&
      (!oldSvg.hasAttribute('role') || oldSvg.getAttribute('role') === 'img') &&
      newSvg.getAttribute('role') === 'img' &&
      Boolean(newSvg.getAttribute('aria-label')?.trim()) &&
      svgSignature(oldSvg, true) === svgSignature(newSvg, true);
    if (!allowedLabel) {
      throw new Error('O reparo alteraria geometria ou textos de SVG editorial em ' + path);
    }
  }
}

/**
 * Protege tabelas, imagens, fontes vinculadas e SVGs inline que a comparação
 * de texto do EPUB, isoladamente, não consegue proteger.
 *
 * Recursos ausentes não são protegidos por esta camada; o reparador já pode
 * marcá-los com texto mediante consentimento. URLs remotas HTTP(S) e links
 * legítimos são preservados salvo opt-in explícito de remoção no sanitizer.
 */
export function auditVisualStructures(
  beforeMarkup: string,
  afterMarkup: string,
  filePath: string,
  mediaType: string,
  originalPaths: ReadonlySet<string>,
  finalPaths: ReadonlySet<string>,
  coverApproval?: CoverReferenceApproval,
  preserveRemote = true,
  approvedCoverSvgLabel = false,
): void {
  const before = parseEditorial(beforeMarkup, mediaType);
  const after = parseEditorial(afterMarkup, mediaType);
  // A auditoria de texto no chamador bloqueia qualquer alteração que não
  // possa ser comparada por parsing (fail-closed).
  if (!before || !after) return;
  validateTables(before, after, filePath);
  validateMedia(before, after, filePath, originalPaths, finalPaths, coverApproval, preserveRemote);
  validateInlineSvg(before, after, filePath, approvedCoverSvgLabel);
}
