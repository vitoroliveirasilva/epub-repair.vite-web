export interface NormalizedPathResult {
  original: string;
  path: string;
  safe: boolean;
  reason?: string | undefined;
}

export function stripFragmentAndQuery(value: string): string {
  return value.split('#')[0]?.split('?')[0] ?? '';
}

export function decodeUriSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeInternalPath(input: string): NormalizedPathResult {
  const original = input;
  // Um nome físico ZIP não é uma URI; preservar #, ?, % e espaços.
  const decoded = input.replace(/\\/g, '/');
  const absolute = decoded.startsWith('/') || /^[a-zA-Z]:\//.test(decoded);
  const hasControlCharacter = containsControlCharacter(decoded);
  const parts: string[] = [];
  let escaped = false;

  for (const raw of decoded.split('/')) {
    const part = raw;
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) {
        escaped = true;
      } else {
        parts.pop();
      }
      continue;
    }
    parts.push(part);
  }

  const path = parts.join('/');
  const safe = Boolean(path) && !absolute && !escaped && !hasControlCharacter;
  let reason: string | undefined;
  if (!path) reason = 'caminho vazio após normalização';
  else if (absolute) reason = 'caminho absoluto não é seguro dentro de EPUB';
  else if (escaped) reason = 'caminho tenta sair da raiz do EPUB usando ..';
  else if (hasControlCharacter) reason = 'caminho contém caractere de controle';

  return { original, path, safe, reason };
}

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

export function normalizePath(input: string): string {
  return normalizeInternalPath(input).path;
}

export function dirname(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index === -1 ? '' : normalized.slice(0, index);
}

export function basename(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index === -1 ? normalized : normalized.slice(index + 1);
}

export function extname(path: string): string {
  const base = basename(path).toLowerCase();
  const index = base.lastIndexOf('.');
  return index === -1 ? '' : base.slice(index);
}

export function isRemoteUrl(value: string): boolean {
  // Bloqueia URLs absolutas, protocol-relative e schemes inesperados,
  // inclusive com espaços/controles usados para ocultar javascript:.
  // eslint-disable-next-line no-control-regex -- rejeita controles que camuflam schemes
  const normalized = value.trim().replace(/[\u0000-\u0020\u007f]/gu, '');
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|\\\\)/iu.test(normalized);
}

export function isInternalAnchor(value: string): boolean {
  return value.trim().startsWith('#');
}

export function resolveReference(baseFileOrDir: string, href: string): NormalizedPathResult {
  const cleanHref = decodeUriSafe(stripFragmentAndQuery(href));
  if (!baseFileOrDir) return normalizeInternalPath(cleanHref);
  const baseDir = baseFileOrDir.endsWith('/') ? baseFileOrDir.slice(0, -1) : dirname(baseFileOrDir);
  return normalizeInternalPath(baseDir ? `${baseDir}/${cleanHref}` : cleanHref);
}

export function resolveFromDir(baseDir: string, href: string): NormalizedPathResult {
  const cleanHref = decodeUriSafe(stripFragmentAndQuery(href));
  return normalizeInternalPath(baseDir ? `${baseDir}/${cleanHref}` : cleanHref);
}

export function encodePathForXml(path: string): string {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part).replace(/%20/g, '%20'))
    .join('/');
}

export function relativePath(fromDir: string, toPath: string): string {
  const from = normalizePath(fromDir).split('/').filter(Boolean);
  const to = normalizePath(toPath).split('/').filter(Boolean);
  while (from.length && to.length && from[0] === to[0]) {
    from.shift();
    to.shift();
  }
  return [...from.map(() => '..'), ...to].join('/') || basename(toPath);
}

export function sanitizeId(value: string): string {
  const sanitized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  return sanitized || 'item';
}

export function makeUniqueId(base: string, usedIds: Set<string>): string {
  const safeBase = sanitizeId(base || 'item');
  let candidate = safeBase;
  let index = 2;

  while (usedIds.has(candidate)) {
    candidate = `${safeBase}-${index}`;
    index += 1;
  }

  usedIds.add(candidate);
  return candidate;
}


/**
 * URLs de rede passivas são referências legítimas de EPUB, inclusive fontes via CSS.
 * Schemes executáveis (javascript:, file:, data:text/html, etc.) não entram aqui.
 */
export function isSafeRemoteResourceUrl(value: string): boolean {
  const cleaned = value.trim();
  return /^(?:https?:\/\/|\/\/)/iu.test(cleaned);
}

export function isSafeExternalLinkUrl(value: string): boolean {
  return isSafeRemoteResourceUrl(value) || /^(?:mailto:|tel:)/iu.test(value.trim());
}

/** Fontes embutidas em CSS por data URI não são documentos executáveis. */
export function isInlineFontDataUrl(value: string): boolean {
  return /^data:(?:font\/(?:woff2?|ttf|otf|sfnt)|application\/(?:font-woff2?|font-sfnt|x-font-(?:woff|ttf|otf)|vnd\.ms-fontobject));base64,[a-z0-9+/=\s]+$/iu.test(value.trim());
}

export function decodeCssEscapes(value: string): string {
  return value.replace(/\\([0-9a-f]{1,6})\s?|\\([^0-9a-f])/giu,
    (_full, hex: string | undefined, escaped: string | undefined) => {
      if (hex) {
        const point = Number.parseInt(hex, 16);
        return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
      }
      return escaped ?? '';
    },
  );
}

/** Imagens raster embutidas são dados passivos. SVG e HTML data: não são permitidos. */
export function isSafeInlineImageDataUrl(value: string): boolean {
  return /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/]+={0,2}$/iu.test(
    value.trim().replace(/\s+/gu, ''),
  );
}

/** Divide srcset preservando a primeira vírgula obrigatória em URLs data:. */
export function splitSrcsetCandidates(value: string): string[] {
  const candidates: string[] = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== ',') continue;
    const current = value.slice(start, index).trim();
    if (/^data:/iu.test(current) && !current.includes(',')) continue;
    if (current) candidates.push(current);
    start = index + 1;
  }
  const last = value.slice(start).trim();
  if (last) candidates.push(last);
  return candidates;
}
