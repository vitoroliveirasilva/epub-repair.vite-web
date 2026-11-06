import { splitSrcsetCandidates, stripFragmentAndQuery } from '../utils/pathUtils';

export interface ResourceReference {
  attr: string;
  value: string;
  raw: string;
  /** Referência proprietária escrita como texto, não atributo executável. */
  kindleText?: boolean;
}

export function extractHtmlResourceReferences(text: string): ResourceReference[] {
  const refs: ResourceReference[] = [];
  const attrRegex = /\b(?:src|href|poster|data|xlink:href)\s*=\s*(["'])(.*?)\1/giu;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(text)) !== null) {
    const value = match[2]?.trim();
    if (!value) continue;
    refs.push({
      attr: inferAttributeName(match[0] ?? 'resource'),
      value: stripFragmentAndQuery(value),
      raw: value,
    });
  }

  const srcsetRegex = /\bsrcset\s*=\s*(["'])(.*?)\1/giu;
  while ((match = srcsetRegex.exec(text)) !== null) {
    const srcset = match[2] ?? '';
    for (const part of splitSrcsetCandidates(srcset)) {
      const value = part.trim().split(/\s+/u)[0];
      if (value) refs.push({ attr: 'srcset', value: stripFragmentAndQuery(value), raw: value });
    }
  }


  const kindleEmbedRegex = /kindle:embed:[^\s"'<>)]*/giu;
  while ((match = kindleEmbedRegex.exec(text)) !== null) {
    const raw = match[0]?.trim();
    if (raw) refs.push({ attr: 'kindle:embed', value: raw, raw, kindleText: true });
  }

  return refs;
}

export function extractCssResourceReferences(text: string): ResourceReference[] {
  const refs: ResourceReference[] = [];
  const source = maskCssComments(text);
  const urlRegex = /url\(\s*(["']?)(.*?)\1\s*\)/giu;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(source)) !== null) {
    const value = match[2]?.trim();
    if (value) refs.push({ attr: 'css:url', value: stripFragmentAndQuery(value), raw: value });
  }

  const importRegex = /@import\s+(?:url\(\s*)?["']([^"']+)["']/giu;
  while ((match = importRegex.exec(source)) !== null) {
    const value = match[1]?.trim();
    if (value) refs.push({ attr: 'css:import', value: stripFragmentAndQuery(value), raw: value });
  }

  return refs;
}

/** Não considerar URLs de comentários CSS, inclusive em exemplos editoriais. */
function maskCssComments(source: string): string {
  const chars = source.split('');
  let quote = '';
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index] ?? '';
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '/' && chars[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      const until = end < 0 ? chars.length : end + 2;
      for (let i = index; i < until; i += 1) {
        if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
      }
      index = until - 1;
    }
  }
  return chars.join('');
}

function inferAttributeName(raw: string): string {
  return raw.split('=')[0]?.trim() || 'resource';
}

/** A validação baseada em DOM não confunde exemplos do livro com atributos reais.
 * A versão textual acima permanece disponível para análise de fragmentos isolados.
 */
export function extractDocumentResourceReferences(doc: Document): ResourceReference[] {
  const refs: ResourceReference[] = [];
  const attributes = new Set(['src', 'href', 'poster', 'data', 'xlink:href']);
  for (const node of Array.from(doc.getElementsByTagName('*'))) {
    for (const attribute of Array.from(node.attributes)) {
      const key = attribute.name.toLowerCase();
      if (key === 'srcset') {
        for (const candidate of splitSrcsetCandidates(attribute.value)) {
          const raw = candidate.trim().split(/\s+/u)[0] ?? '';
          if (raw) refs.push({ attr: 'srcset', value: stripFragmentAndQuery(raw), raw });
        }
      } else if (attributes.has(key)) {
        const raw = attribute.value.trim();
        if (raw) refs.push({ attr: key, value: stripFragmentAndQuery(raw), raw });
      }
    }
  }

  // Detectar texto Kindle separadamente, sem tratá-lo como atributo real.
  // Exemplos em pre/code/kbd/samp são sempre literais editoriais.
  const stack: Node[] = [doc.documentElement];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.nodeType === 8) continue;
    if (node.nodeType === 3) {
      const parent = node.parentElement;
      const inExample = parent?.closest('code, pre, kbd, samp') !== null;
      if (!inExample) {
        for (const match of (node.nodeValue ?? '').matchAll(/kindle:embed:[^\s"'<>)]*/giu)) {
          const raw = match[0];
          if (raw) refs.push({
            attr: 'kindle:embed', value: raw, raw, kindleText: true,
          });
        }
      }
    }
    for (const child of Array.from(node.childNodes).reverse()) stack.push(child);
  }

  return refs;
}
