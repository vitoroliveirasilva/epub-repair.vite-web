import type { PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction } from '../model/repairTypes';
import { decodeUtf8ForRewrite } from '../utils/textEncoding';
import { parseXml } from '../utils/xmlUtils';
import { labelSingleCoverSvg } from './coverSvgAccessibility';

/**
 * Melhoria acessível estritamente limitada ao SVG simples de página de capa.
 * Preserva integralmente os bytes dos demais XHTML, imagens, CSS e NCX.
 */
export function repairCoverSvgAccessibility(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
): RepairAction[] {
  const actions: RepairAction[] = [];
  for (const item of pkg.manifest) {
    if (!item.exists || item.mediaType !== 'application/xhtml+xml') continue;
    const bytes = files.get(item.resolvedPath);
    if (!bytes) continue;

    // Evitar parse/regravação de capítulos que não contêm SVG.
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (!/<svg(?:\s|>)/iu.test(raw)) continue;
    const source = decodeUtf8ForRewrite(bytes, item.resolvedPath);
    let document: Document;
    try {
      document = parseXml(source.replace(/&nbsp;/giu, '&#160;'), 'application/xhtml+xml');
    } catch {
      continue; // XHTML malformado exige diagnóstico próprio.
    }
    const output = labelSingleCoverSvg(source, document, item.resolvedPath, pkg);
    if (output === source) continue;
    try {
      parseXml(output.replace(/&nbsp;/giu, '&#160;'), 'application/xhtml+xml');
    } catch {
      continue; // Nunca liberar um documento reescrito que não pode ser parseado.
    }
    files.set(item.resolvedPath, new TextEncoder().encode(output));
    actions.push({
      type: 'updated',
      title: 'SVG da capa recebeu rótulo acessível',
      detail: 'O SVG que exibe somente a capa oficial recebeu o nome já ' +
        'presente no título da página, sem modificar imagem ou texto editorial.',
      file: item.resolvedPath,
    });
  }
  return actions;
}
