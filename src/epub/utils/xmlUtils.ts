export function parseXml(
  text: string,
  mimeType: DOMParserSupportedType = 'application/xml',
): Document {
  // Comentários e CDATA podem citar uma declaração maliciosa literalmente.
  // Escanear apenas tokens XML efetivos evita alarmes falsos sem relaxar o parser.
  const structural = text.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/gu, '');
  if (/<!ENTITY\b/iu.test(structural)) {
    throw new Error('Entidades XML personalizadas não são permitidas por segurança.');
  }
  if (/<!DOCTYPE\b/iu.test(structural)) {
    // NCX EPUB 2 tradicional e XHTML legado usam DTDs públicas. Não resolvemos
    // nenhuma entidade externa; subconjuntos internos e DTDs desconhecidas são recusados.
    const doctype = structural.match(/<!DOCTYPE\s+[^>]*>/iu)?.[0] ?? '';
    const legacyNcx = /^<!DOCTYPE\s+ncx\s+PUBLIC\s+["']-\/\/NISO\/\/DTD ncx 2005-1\/\/EN["']\s+["']https?:\/\/www\.daisy\.org\/z3986\/2005\/ncx-2005-1\.dtd["']\s*>$/iu;
    const legacyXhtml = /^<!DOCTYPE\s+html\s+PUBLIC\s+["']-\/\/W3C\/\/DTD XHTML 1\.1\/\/EN["']\s+["']https?:\/\/www\.w3\.org\/TR\/xhtml11\/DTD\/xhtml11\.dtd["']\s*>$/iu;
    if (!doctype || /<!DOCTYPE\s+[^>]*\[/iu.test(structural) ||
        (!legacyNcx.test(doctype) && !legacyXhtml.test(doctype))) {
      throw new Error('DOCTYPE com subconjunto interno ou DTD externa não permitida.');
    }
  }
  const doc = new DOMParser().parseFromString(text, mimeType);
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error(parserError.textContent?.trim() || 'XML inválido.');
  }
  if (doc.getElementsByTagNameNS('http://www.w3.org/2001/XInclude', 'include').length > 0) {
    throw new Error('XInclude não é permitido em arquivos XML do EPUB.');
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
