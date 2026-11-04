import { isRemoteUrl } from '../utils/pathUtils';

/**
 * Segunda camada de limpeza usando a árvore real do documento.
 * Entidades HTML são decodificadas pelo parser antes de validar atributos,
 * evitando que sequências como java&#x73;cript: escapem dos filtros textuais.
 */
export function sanitizeActiveContentMarkup(
  markup: string,
  filePath: string,
  options: {
    sanitizeScripts: boolean;
    kindleSafeMode: boolean;
    removeRemoteResourceLinks: boolean;
  },
): { text: string; changed: boolean } {
  if (typeof DOMParser === 'undefined') return { text: markup, changed: false };

  const isHtml = /\.html?$/iu.test(filePath);
  // &nbsp; é válido em HTML, mas não é entidade predefinida no XML.
  const parseSource = isHtml ? markup : markup.replace(/&nbsp;/giu, '&#160;');
  const doc = new DOMParser().parseFromString(
    parseSource,
    isHtml ? 'text/html' : 'application/xhtml+xml',
  );

  if (!isHtml && doc.getElementsByTagName('parsererror').length > 0) {
    // Não declarar conteúdo malformado como limpo ou gerar um EPUB inseguro.
    throw new Error(`XHTML inválido em "${filePath}": não é possível sanitizar com segurança.`);
  }

  let changed = false;
  const forbiddenElements = new Set([
    'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'foreignobject',
    'applet', 'portal', 'animate', 'animatemotion', 'animatetransform', 'set',
  ]);
  const urlAttributes = new Set([
    'href', 'xlink:href', 'src', 'poster', 'data', 'background', 'cite', 'longdesc',
    'usemap', 'manifest', 'formaction', 'action',
  ]);
  const elements = Array.from(doc.getElementsByTagName('*'));

  for (const element of elements) {
    if (!element.isConnected) continue;
    const name = element.localName.toLowerCase();

    if (
      (options.sanitizeScripts && forbiddenElements.has(name)) ||
      (options.kindleSafeMode && ['iframe', 'object', 'embed', 'foreignobject'].includes(name)) ||
      (options.sanitizeScripts && name === 'meta' &&
        (element.getAttribute('http-equiv') ?? '').toLowerCase() === 'refresh')
    ) {
      element.remove();
      changed = true;
      continue;
    }

    if (options.sanitizeScripts && name === 'style' && /@import|url\s*\(|expression\s*\(|behavior\s*:|-moz-binding/iu.test(element.textContent ?? '')) {
      element.remove();
      changed = true;
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const attrName = attribute.name.toLowerCase();
      const attrLocal = attribute.localName.toLowerCase();
      const value = attribute.value;

      if (
        (options.sanitizeScripts && (attrName.startsWith('on') || attrName === 'srcdoc' ||
          attrName === 'nonce' || attrName === 'formaction' || attrName === 'action')) ||
        (options.sanitizeScripts && attrName === 'style' &&
          /@import|url\s*\(|expression\s*\(|behavior\s*:|-moz-binding/iu.test(value))
      ) {
        element.removeAttributeNode(attribute);
        changed = true;
        continue;
      }

      if (attrLocal === 'srcset') {
        const candidates = value.split(',').map((part) => part.trim()).filter(Boolean);
        const safe = candidates.filter((part) => {
          const url = part.split(/\s+/u)[0] ?? '';
          return !shouldRemoveUrl(url, options);
        });
        if (safe.length !== candidates.length) {
          if (safe.length) element.setAttribute(attrName, safe.join(', '));
          else element.removeAttributeNode(attribute);
          changed = true;
        }
        continue;
      }

      if (
        (urlAttributes.has(attrName) || urlAttributes.has(attrLocal)) &&
        shouldRemoveUrl(value, options)
      ) {
        element.removeAttributeNode(attribute);
        changed = true;
      }
    }
  }

  if (!changed) return { text: markup, changed: false };
  const serialized = new XMLSerializer().serializeToString(doc);
  // XMLSerializer omite a declaração XML, que é preservada caso existisse.
  const declaration = !isHtml ? markup.match(/^\s*<\?xml\s+[^?]*\?>/iu)?.[0] : undefined;
  return {
    text: declaration ? `${declaration.trim()}\n${serialized}` : serialized,
    changed: true,
  };
}

export function shouldRemoveUrl(
  url: string,
  options: Pick<Parameters<typeof sanitizeActiveContentMarkup>[2], 'sanitizeScripts' | 'removeRemoteResourceLinks'>,
): boolean {
  // Remove controles e espaços que navegadores ignoram ao interpretar schemes.
  const normalized = url.replace(/[\u0000-\u0020\u007f]/gu, '').toLowerCase();
  if (!normalized) return false;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/iu.test(normalized);
  const isProtocolRelative = normalized.startsWith('//') || normalized.startsWith('\\\\');
  if (options.removeRemoteResourceLinks && (hasScheme || isProtocolRelative || isRemoteUrl(url))) {
    return true;
  }
  if (!options.sanitizeScripts) return false;
  return isProtocolRelative || /^(?:javascript|vbscript|data|blob|file|filesystem):/iu.test(normalized);
}
