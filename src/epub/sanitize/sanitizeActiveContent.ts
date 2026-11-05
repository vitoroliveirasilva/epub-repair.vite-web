import {
  decodeCssEscapes,
  isInlineFontDataUrl,
  isSafeInlineImageDataUrl,
  splitSrcsetCandidates,
  isRemoteUrl,
  isSafeExternalLinkUrl,
  isSafeRemoteResourceUrl,
} from '../utils/pathUtils';

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

    if (options.sanitizeScripts && name === 'style' && containsDangerousCss(element.textContent ?? '')) {
      // Preservar regras benignas em vez de descartar toda a tipografia da obra.
      const sanitized = sanitizeDangerousEmbeddedCss(element.textContent ?? '');
      if (containsDangerousCss(sanitized)) {
        throw new Error(
          'CSS embutido ofuscado ou incomum exige revisão manual em ' + filePath +
          ': não é seguro descartar o bloco <style> nem afirmar que foi neutralizado.',
        );
      }
      element.textContent = sanitized;
      changed = true;
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const attrName = attribute.name.toLowerCase();
      const attrLocal = attribute.localName.toLowerCase();
      const value = attribute.value;

      if (options.sanitizeScripts && attrName === 'style' && containsDangerousCss(value)) {
        const sanitized = sanitizeDangerousEmbeddedCss(value);
        if (containsDangerousCss(sanitized)) {
          throw new Error(
            'CSS inline ofuscado ou incomum exige revisão manual em ' + filePath +
            ': a propriedade não será apagada sem comprovação.',
          );
        }
        element.setAttribute(attrName, sanitized);
        changed = true;
        continue;
      }
      if (options.sanitizeScripts && (attrName.startsWith('on') || attrName === 'srcdoc' ||
        attrName === 'nonce' || attrName === 'formaction' || attrName === 'action')) {
        element.removeAttributeNode(attribute);
        changed = true;
        continue;
      }

      if (attrLocal === 'srcset') {
        const candidates = splitSrcsetCandidates(value);
        const safe = candidates.filter((part) => {
          const url = part.split(/\s+/u)[0] ?? '';
          return !shouldRemoveUrl(url, options, 'srcset');
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
        shouldRemoveUrl(
          value, options,
          element.namespaceURI === 'http://www.w3.org/2000/svg' &&
            (name === 'image' || name === 'feimage') &&
            attrLocal === 'href' ? 'svg-image-href' : attrLocal,
        )
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
  attribute = '',
): boolean {
  // eslint-disable-next-line no-control-regex -- controles escondem schemes executáveis
  const normalized = url.replace(/[\u0000-\u0020\u007f]/gu, '').toLowerCase();
  if (!normalized) return false;
  if (['src', 'srcset', 'poster', 'svg-image-href'].includes(attribute) &&
      isSafeInlineImageDataUrl(normalized)) {
    return false; // Dados raster embutidos não são conexões de rede.
  }
  if (isRemoteUrl(normalized) && options.removeRemoteResourceLinks) return true;
  if (!options.sanitizeScripts) return false;
  return isRemoteUrl(normalized) && !isSafeExternalLinkUrl(normalized);
}

/** Usa somente URLs ativas como sinal de risco; fontes e @import HTTPS não são perigosos por si. */
export function containsDangerousCss(text: string): boolean {
  // CSS permite escapes e comentários entre partes de tokens. Canonicalizar
  // para DETECÇÃO apenas; nunca reescrever todo o CSS com esta transformação.
  const canonical = decodeCssEscapes(text.replace(/\/\*[\s\S]*?\*\//gu, ''));
  if (/expression\s*\(|behavior\s*:|-moz-binding\s*:/iu.test(canonical)) return true;

  for (const match of canonical.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/giu)) {
    const value = decodeCssEscapes(match[2] ?? '');
    if (isRemoteUrl(value) && !isSafeRemoteResourceUrl(value) && !isInlineFontDataUrl(value)) {
      return true;
    }
  }

  for (const match of canonical.matchAll(/@import\s+(?:url\(\s*)?(?:(["'])(.*?)\1|([^"'\s);]+))/giu)) {
    const value = decodeCssEscapes(match[2] || match[3] || '');
    if (isRemoteUrl(value) && !isSafeRemoteResourceUrl(value)) return true;
  }

  return false;
}

/** Preserva CSS passivo e neutraliza somente links executáveis reconhecíveis.
 * Em sintaxes impossíveis de sanar, o chamador remove o style inteiro.
 */
function sanitizeDangerousEmbeddedCss(css: string): string {
  let result = css.replace(
    /@import\s+(?:url\(\s*)?(?:(["'])(.*?)\1|([^"'\s);]+))\s*\)?[^;]*;/giu,
    (full) => containsDangerousCss(full) ? '' : full,
  );
  // Remover somente declarações CSS executáveis; preservar fonte e tipografia
  // inofensivas do mesmo bloco. A verificação posterior continua fail-closed.
  result = result.replace(
    /(^|[;{])\s*(?:behavior|-moz-binding)\s*:[^;{}]*(?=[;}]|$)/giu,
    '$1',
  );
  result = result.replace(
    /(^|[;{])\s*[-\w]+\s*:[^;{}]*?expression\s*\([^;{}]*(?=[;}]|$)/giu,
    '$1',
  );
  result = result.replace(/url\(\s*(["']?)(.*?)\1\s*\)/giu, (full, _quote: string, value: string) => {
    const decoded = decodeCssEscapes(value);
    if (isRemoteUrl(decoded) && !isSafeRemoteResourceUrl(decoded) && !isInlineFontDataUrl(decoded)) {
      return 'none';
    }
    return full;
  });
  return result;
}
