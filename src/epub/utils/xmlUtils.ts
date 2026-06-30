export function parseXml(
  text: string,
  mimeType: DOMParserSupportedType = 'application/xml',
): Document {
  const doc = new DOMParser().parseFromString(text, mimeType);
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error(parserError.textContent?.trim() || 'XML inválido.');
  }
  return doc;
}

export function parseHtml(text: string): Document {
  return new DOMParser().parseFromString(text, 'text/html');
}

export function serializeXml(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function getAttr(element: Element | undefined, name: string): string | undefined {
  const value = element?.getAttribute(name);
  return value?.trim() || undefined;
}

export function textOfFirstLocalName(
  doc: Document | Element,
  localName: string,
): string | undefined {
  const element = findFirstByLocalName(doc, localName);
  const value = element?.textContent?.trim();
  return value || undefined;
}

export function findFirstByLocalName(
  root: Document | Element,
  localName: string,
): Element | undefined {
  return findByLocalName(root, localName)[0];
}

export function findByLocalName(root: Document | Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter(
    (element) => element.localName === localName,
  );
}

export function childElementsByLocalName(
  parent: Element | undefined,
  localName: string,
): Element[] {
  if (!parent) return [];
  return Array.from(parent.children).filter((child) => child.localName === localName);
}

export function ensureXmlDeclaration(text: string): string {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('<?xml')) return trimmed;
  return `<?xml version="1.0" encoding="UTF-8"?>\n${trimmed}`;
}
