import type { Issue } from '../model/issueTypes';
import type { ManifestItem, PackageDocumentInfo } from '../model/opfTypes';
import { createIssue } from '../utils/issueFactory';

/**
 * EPUB 3: somente XHTML e SVG podem ser documentos primários do spine sem
 * fallback. Fallbacks apontam por ID, não por href, e não devem ser criados
 * a partir da ordem editorial presumida do manifest.
 */
const CONTENT_DOCUMENTS = new Set(['application/xhtml+xml', 'image/svg+xml']);
const CORE_MEDIA = new Set([
  'application/xhtml+xml', 'image/svg+xml', 'image/gif', 'image/jpeg',
  'image/png', 'image/webp', 'audio/mpeg', 'audio/mp4', 'audio/ogg',
  'text/css', 'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
  'application/font-sfnt', 'application/vnd.ms-opentype',
  'application/font-woff', 'application/javascript', 'application/ecmascript',
  'text/javascript', 'application/x-dtbncx+xml', 'application/smil+xml',
]);

function normalizedType(item: ManifestItem): string {
  return item.mediaType.toLowerCase().split(';')[0]?.trim() ?? '';
}

type Chain = { kind: 'ok' | 'missing' | 'cycle' | 'missing-file' | 'no-terminal'; core: boolean; document: boolean };

/** Verifica cadeias de IDs, sem consultar rede, executar ou alterar recursos. */
function inspectChain(
  initial: ManifestItem,
  byId: Map<string, ManifestItem>,
): Chain {
  const visited = new Set([initial.id]);
  let item = initial;
  let core = false;
  let document = false;
  while (item.fallback) {
    const next = byId.get(item.fallback);
    if (!next) return { kind: 'missing', core, document };
    if (visited.has(next.id)) return { kind: 'cycle', core, document };
    visited.add(next.id);
    const mediaType = normalizedType(next);
    // Um XHTML/SVG remoto não pode substituir um documento de leitura que
    // precisa estar dentro do container. Fontes/áudio externos seguem válidos.
    if ((!next.remote && !next.exists) || !next.pathSafe ||
        (next.remote && CONTENT_DOCUMENTS.has(mediaType))) {
      return { kind: 'missing-file', core, document };
    }
    if (CORE_MEDIA.has(mediaType)) core = true;
    if (CONTENT_DOCUMENTS.has(mediaType)) document = true;
    item = next;
  }
  return { kind: core ? 'ok' : 'no-terminal', core, document };
}

export function validateManifestFallbacks(pkg: PackageDocumentInfo): Issue[] {
  if (!pkg.version.trim().startsWith('3')) return [];
  const issues: Issue[] = [];
  const byId = new Map(pkg.manifest.map((item) => [item.id, item]));
  const reported = new Set<string>();

  for (const spineItem of pkg.spine) {
    const item = spineItem.manifestItem ?? byId.get(spineItem.idref);
    if (!item || CONTENT_DOCUMENTS.has(normalizedType(item))) continue;
    // Mesmo tipos core (imagem, áudio etc.) são documentos estrangeiros no spine.
    const chain = inspectChain(item, byId);
    if (chain.kind === 'missing' || chain.kind === 'cycle') continue;
    if (chain.document) continue;
    reported.add(item.id);
    issues.push(createIssue({
      code: 'OPF_SPINE_FOREIGN_FALLBACK_MISSING',
      severity: 'warning',
      title: 'Recurso estrangeiro no spine sem documento EPUB de fallback',
      detail: 'O item "' + item.id + '" tem media-type "' + item.mediaType +
        '", mas a cadeia fallback não alcança XHTML/SVG existente. Não é seguro ' +
        'inventar capítulo alternativo ou alterar a ordem de leitura.',
      file: pkg.opfPath,
      context: item.id,
      repairable: false,
    }));
  }

  for (const item of pkg.manifest) {
    if (!item.fallback || reported.has(item.id) ||
        CONTENT_DOCUMENTS.has(normalizedType(item))) continue;
    const chain = inspectChain(item, byId);
    if (chain.kind === 'missing' || chain.kind === 'cycle') continue;
    if (chain.kind === 'ok') continue;
    issues.push(createIssue({
      code: 'OPF_FALLBACK_INVALID_TERMINAL',
      severity: 'warning',
      title: 'Cadeia fallback sem recurso core válido',
      detail: 'O recurso "' + item.id + '" declara fallback, mas a cadeia ' +
        'não alcança um formato core existente. Preservar a declaração até revisão.',
      file: pkg.opfPath,
      context: item.id,
      repairable: false,
    }));
  }

  return issues;
}
