import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import type { ManifestItem, PackageDocumentInfo } from '../model/opfTypes';
import { createIssue } from '../utils/issueFactory';
import { isRemoteUrl, resolveReference, splitSrcsetCandidates } from '../utils/pathUtils';
import { parseXml } from '../utils/xmlUtils';

/**
 * EPUB 3: somente XHTML e SVG podem ser documentos primários do spine sem
 * fallback. Fallbacks apontam por ID, não por href, e não devem ser criados
 * a partir da ordem editorial presumida do manifest.
 */
const CONTENT_DOCUMENTS = new Set(['application/xhtml+xml', 'image/svg+xml']);
const CORE_MEDIA = new Set([
  'application/xhtml+xml', 'image/svg+xml', 'image/gif', 'image/jpeg',
  'image/png', 'image/webp', 'audio/mpeg', 'audio/mp4',
  'text/css', 'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
  'application/font-sfnt', 'application/vnd.ms-opentype',
  'application/font-woff', 'application/javascript', 'application/ecmascript',
  'text/javascript', 'application/x-dtbncx+xml', 'application/smil+xml',
]);

function normalizedType(item: ManifestItem): string {
  return item.mediaType.toLowerCase().split(';')[0]?.trim() ?? '';
}

/** audio/ogg é core apenas quando o codec OPUS está declarado (EPUB 3.3).
 * Não considerar outros codecs OGG automaticamente suportados.
 */
function isCoreMedia(item: ManifestItem): boolean {
  const media = normalizedType(item);
  if (media !== 'audio/ogg') return CORE_MEDIA.has(media);
  return item.mediaType.split(';').slice(1).some((parameter) =>
    /^\s*codecs\s*=\s*(?:"opus"|'opus'|opus)\s*$/iu.test(parameter));
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
    if (isCoreMedia(next)) core = true;
    if (CONTENT_DOCUMENTS.has(mediaType)) document = true;
    item = next;
  }
  // EPUB 3.3: basta haver um core media type ou EPUB Content Document
  // em qualquer ponto da cadeia. Exigir que seja o último é falso positivo.
  return { kind: core ? 'ok' : 'no-terminal', core, document };
}

export function validateManifestFallbacks(pkg: PackageDocumentInfo, loaded?: LoadedEpub): Issue[] {
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


  if (loaded) {
    const byPath = new Map(pkg.manifest.map((item) => [item.resolvedPath, item]));
    for (const docItem of pkg.manifest) {
      if (!docItem.exists || docItem.mediaType !== 'application/xhtml+xml') continue;
      const bytes = loaded.files.get(docItem.resolvedPath)?.bytes;
      if (!bytes) continue;
      let doc: Document;
      try {
        doc = parseXml(new TextDecoder('utf-8', { fatal: true }).decode(bytes)
          .replace(/&nbsp;/giu, '&#160;'), 'application/xhtml+xml');
      } catch {
        continue; // Diagnóstico XML inválido pertence ao validador de conteúdo.
      }
      for (const image of Array.from(doc.getElementsByTagName('*'))
        .filter((node) => node.localName.toLowerCase() === 'img')) {
        const references = [
          ...(image.getAttribute('src') ? [image.getAttribute('src')!] : []),
          ...splitSrcsetCandidates(image.getAttribute('srcset') ?? '')
            .map((candidate) => candidate.trim().split(/\s+/u)[0] ?? ''),
        ];
        for (const ref of references) {
          if (!ref || isRemoteUrl(ref)) continue;
          const target = resolveReference(docItem.resolvedPath, ref);
          if (!target.safe) continue;
          const resource = byPath.get(target.path);
          if (!resource || !resource.exists || isCoreMedia(resource)) continue;
          const chain = inspectChain(resource, byId);
          if (chain.core || chain.kind === 'missing' || chain.kind === 'cycle') continue;
          issues.push(createIssue({
            code: 'OPF_FOREIGN_CONTENT_FALLBACK_MISSING',
            severity: 'warning',
            title: 'Imagem estrangeira sem fallback de formato core',
            detail: 'O XHTML "' + docItem.id + '" incorpora recurso "' + resource.id +
              '" não suportado como tipo core e sem fallback core verificável. ' +
              'Texto alternativo e URLs legítimas são preservados para revisão.',
            file: docItem.resolvedPath,
            context: ref,
            repairable: false,
          }));
        }
      }
    }
  }

  return issues;
}
