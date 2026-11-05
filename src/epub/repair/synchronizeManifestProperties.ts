import type { PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction } from '../model/repairTypes';
import { isRemoteUrl, resolveFromDir } from '../utils/pathUtils';
import { childElementsByLocalName, findFirstByLocalName, parseXml,
  serializeXmlPreservingDeclaration } from
  '../utils/xmlUtils';
import { decodeUtf8ForRewrite } from '../utils/textEncoding';
import { inferRequiredManifestProperties } from '../validation/validateManifestContentProperties';

/**
 * O OPF inicialmente pode declarar novos recursos órfãos; depois do saneamento
 * efetivo, ajustar somente as propriedades COMPROVADAS dos bytes finais.
 * Nunca marcar um hyperlink HTTP como recurso remoto nem inventar scripting.
 */
export function synchronizeManifestProperties(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
): RepairAction[] {
  if (!pkg.version.trim().startsWith('3')) return [];
  const opfBytes = files.get(pkg.opfPath);
  if (!opfBytes) return [];
  const opfSource = decodeUtf8ForRewrite(opfBytes, pkg.opfPath);
  const doc = parseXml(opfSource);
  const manifest = findFirstByLocalName(doc, 'manifest');
  if (!manifest) return [];
  const updates: Array<{ id: string; values: string[] }> = [];

  for (const element of childElementsByLocalName(manifest, 'item')) {
    const href = element.getAttribute('href')?.trim() ?? '';
    if (!href || isRemoteUrl(href)) continue;
    const resolved = resolveFromDir(pkg.opfDir, href);
    if (!resolved.safe) continue;
    const bytes = files.get(resolved.path);
    if (!bytes) continue;
    const media = element.getAttribute('media-type') ?? '';
    const detected = inferRequiredManifestProperties(media, bytes);
    if (detected.length === 0) continue;
    const current = (element.getAttribute('properties') ?? '').split(/\s+/u).filter(Boolean);
    const additions = detected.filter((property) => !current.includes(property));
    if (additions.length === 0) continue;
    element.setAttribute('properties', [...current, ...additions].join(' '));
    updates.push({ id: element.getAttribute('id') ?? resolved.path, values: additions });
  }

  if (updates.length === 0) return [];
  files.set(pkg.opfPath, new TextEncoder().encode(serializeXmlPreservingDeclaration(doc, opfSource)));
  return updates.map((update) => ({
    type: 'updated' as const,
    title: 'Propriedades obrigatórias adicionadas ao manifest',
    detail: 'Item "' + update.id + '": ' + update.values.join(', ') +
      '. Conteúdo e URLs HTTP/HTTPS legítimas foram preservados.',
    file: pkg.opfPath,
  }));
}
