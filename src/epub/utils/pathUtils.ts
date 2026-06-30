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
  const decoded = decodeUriSafe(stripFragmentAndQuery(input.trim())).replace(/\\/g, '/');
  const absolute = decoded.startsWith('/') || /^[a-zA-Z]:\//.test(decoded);
  const parts: string[] = [];
  let escaped = false;

  for (const raw of decoded.split('/')) {
    const part = raw.trim();
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
  const safe = Boolean(path) && !absolute && !escaped && !path.includes('\u0000');
  let reason: string | undefined;
  if (!path) reason = 'caminho vazio após normalização';
  else if (absolute) reason = 'caminho absoluto não é seguro dentro de EPUB';
  else if (escaped) reason = 'caminho tenta sair da raiz do EPUB usando ..';
  else if (path.includes('\u0000')) reason = 'caminho contém byte nulo';

  return { original, path, safe, reason };
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
  return /^(?:https?:|mailto:|tel:|data:|javascript:|blob:|ftp:|file:)/i.test(value.trim());
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
