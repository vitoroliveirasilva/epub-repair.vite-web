import type { LoadedEpub } from '../model/epubTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction, RepairOptions } from '../model/repairTypes';
import { CSS_MEDIA_TYPES, HTML_MEDIA_TYPES } from '../utils/constants';
import { sanitizeCssDocument } from '../sanitize/sanitizeCss';
import { sanitizeHtmlDocument } from '../sanitize/sanitizeHtml';
import { containsDangerousCss, sanitizeActiveContentMarkup } from '../sanitize/sanitizeActiveContent';
import { extractCssResourceReferences } from '../validation/referenceExtractor';
import { decodeCssEscapes, resolveReference } from '../utils/pathUtils';
import { decodeUtf8ForRewrite } from '../utils/textEncoding';

export function repairContentDocuments(
  files: Map<string, Uint8Array>,
  loaded: LoadedEpub,
  pkg: PackageDocumentInfo,
  options: RepairOptions,
): RepairAction[] {
  const actions: RepairAction[] = [];
  const existingFiles = new Set(files.keys());
  const encoder = new TextEncoder();

  for (const item of pkg.manifest) {
    const entry = loaded.files.get(item.resolvedPath);
    if (!entry || !files.has(item.resolvedPath)) continue;

    if (HTML_MEDIA_TYPES.has(item.mediaType)) {
      const result = sanitizeHtmlDocument(decodeUtf8ForRewrite(entry.bytes, item.resolvedPath), {
        filePath: item.resolvedPath,
        existingFiles,
        kindleSafeMode: options.kindleSafeMode,
        removeRemoteResourceLinks: options.removeRemoteResourceLinks,
        sanitizeScripts: options.sanitizeScripts,
        replaceMissingImagesWithText: options.replaceMissingImagesWithText,
      });
      if (result.changed) {
        files.set(item.resolvedPath, encoder.encode(result.text));
        actions.push(...result.actions);
      }
    }

    
    if (
      item.mediaType === 'image/svg+xml' &&
      (options.sanitizeScripts || options.removeRemoteResourceLinks)
    ) {
      const result = sanitizeActiveContentMarkup(
        decodeUtf8ForRewrite(entry.bytes, item.resolvedPath),
        item.resolvedPath,
        options,
      );
      if (result.changed) {
        files.set(item.resolvedPath, encoder.encode(result.text));
        actions.push({
          type: 'updated',
          title: 'SVG com conteúdo ativo neutralizado',
          detail: 'Scripts, eventos, links inseguros e recursos externos foram removidos do SVG.',
          file: item.resolvedPath,
        });
      }
    }

    if (options.repairCssReferences && CSS_MEDIA_TYPES.has(item.mediaType)) {
      const result = sanitizeCssDocument(
        item.resolvedPath,
        decodeUtf8ForRewrite(entry.bytes, item.resolvedPath),
        existingFiles,
        options.removeRemoteResourceLinks,
      );
      if (result.changed) {
        files.set(item.resolvedPath, encoder.encode(result.text));
        actions.push(...result.actions);
      }
    }
  }

  return actions;
}






export function repairActiveContentOnly(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
  options: RepairOptions,
): RepairAction[] {
  if (!options.sanitizeScripts && !options.removeRemoteResourceLinks) return [];
  const actions: RepairAction[] = [];
  const encoder = new TextEncoder();
  const processed = new Set<string>();

  for (const item of pkg.manifest) {
    const path = item.resolvedPath;
    if (!item.exists || processed.has(path)) continue;
    processed.add(path);
    const bytes = files.get(path);
    if (!bytes) continue;
    
    
    const isMarkup = HTML_MEDIA_TYPES.has(item.mediaType) ||
      item.mediaType === 'image/svg+xml';
    if (!isMarkup && item.mediaType !== 'text/css') continue;
    const original = decodeUtf8ForRewrite(bytes, path);
    if (isMarkup) {
      const cleaned = sanitizeActiveContentMarkup(original, path, {
        sanitizeScripts: options.sanitizeScripts,
        kindleSafeMode: false,
        removeRemoteResourceLinks: options.removeRemoteResourceLinks,
      });
      if (cleaned.changed) {
        files.set(path, encoder.encode(cleaned.text));
        actions.push({
          type: 'updated',
          title: 'Conteúdo ativo neutralizado no modo conservador',
          detail: 'Scripts, eventos e URLs incompatíveis com as opções selecionadas foram ' +
            'neutralizados, preservando texto e recursos passivos sempre que possível.',
          file: path,
        });
      }
      continue;
    }
    if (item.mediaType !== 'text/css' ||
        (!containsDangerousCss(original) && !options.removeRemoteResourceLinks)) continue;

    
    
    const knownResources = new Set(files.keys());
    for (const reference of extractCssResourceReferences(original)) {
      const normalized = decodeCssEscapes(reference.value);
      const target = resolveReference(path, normalized);
      if (target.safe) knownResources.add(target.path);
    }
    const cleaned = sanitizeCssDocument(
      path, original, knownResources, options.removeRemoteResourceLinks,
    );
    if (cleaned.changed) {
      files.set(path, encoder.encode(cleaned.text));
      actions.push({
        type: 'updated',
        title: 'CSS ativo neutralizado no modo conservador',
        detail: 'URLs perigosas foram neutralizadas sem remover fontes legítimas nem ' +
          'referências locais apenas porque o arquivo está ausente.',
        file: path,
      });
    }
  }
  return actions;
}
