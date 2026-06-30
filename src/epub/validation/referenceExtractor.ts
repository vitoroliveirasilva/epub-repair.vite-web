import { stripFragmentAndQuery } from '../utils/pathUtils';

export interface ResourceReference {
  attr: string;
  value: string;
  raw: string;
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
    for (const part of srcset.split(',')) {
      const value = part.trim().split(/\s+/u)[0];
      if (value) refs.push({ attr: 'srcset', value: stripFragmentAndQuery(value), raw: value });
    }
  }

  const kindleEmbedRegex = /kindle:embed:[^\s"'<>)]*/giu;
  while ((match = kindleEmbedRegex.exec(text)) !== null) {
    const value = match[0]?.trim();
    if (value) refs.push({ attr: 'kindle:embed', value, raw: value });
  }

  return refs;
}

export function extractCssResourceReferences(text: string): ResourceReference[] {
  const refs: ResourceReference[] = [];
  const urlRegex = /url\(\s*(["']?)(.*?)\1\s*\)/giu;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    const value = match[2]?.trim();
    if (value) refs.push({ attr: 'css:url', value: stripFragmentAndQuery(value), raw: value });
  }

  const importRegex = /@import\s+(?:url\(\s*)?["']([^"']+)["']/giu;
  while ((match = importRegex.exec(text)) !== null) {
    const value = match[1]?.trim();
    if (value) refs.push({ attr: 'css:import', value: stripFragmentAndQuery(value), raw: value });
  }

  return refs;
}

function inferAttributeName(raw: string): string {
  return raw.split('=')[0]?.trim() || 'resource';
}
