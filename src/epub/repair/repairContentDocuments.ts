import type { LoadedEpub } from '../model/epubTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction, RepairOptions } from '../model/repairTypes';
import { CSS_MEDIA_TYPES, HTML_MEDIA_TYPES } from '../utils/constants';
import { sanitizeCssDocument } from '../sanitize/sanitizeCss';
import { sanitizeHtmlDocument } from '../sanitize/sanitizeHtml';

export function repairContentDocuments(
  files: Map<string, Uint8Array>,
  loaded: LoadedEpub,
  pkg: PackageDocumentInfo,
  options: RepairOptions,
): RepairAction[] {
  const actions: RepairAction[] = [];
  const existingFiles = new Set(files.keys());
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const encoder = new TextEncoder();

  for (const item of pkg.manifest) {
    const entry = loaded.files.get(item.resolvedPath);
    if (!entry || !files.has(item.resolvedPath)) continue;

    if (HTML_MEDIA_TYPES.has(item.mediaType)) {
      const result = sanitizeHtmlDocument(decoder.decode(entry.bytes), {
        filePath: item.resolvedPath,
        existingFiles,
        kindleSafeMode: options.kindleSafeMode,
        removeRemoteResourceLinks: options.removeRemoteResourceLinks,
        sanitizeScripts: options.sanitizeScripts,
      });
      if (result.changed) {
        files.set(item.resolvedPath, encoder.encode(result.text));
        actions.push(...result.actions);
      }
    }

    if (options.repairCssReferences && CSS_MEDIA_TYPES.has(item.mediaType)) {
      const result = sanitizeCssDocument(
        item.resolvedPath,
        decoder.decode(entry.bytes),
        existingFiles,
      );
      if (result.changed) {
        files.set(item.resolvedPath, encoder.encode(result.text));
        actions.push(...result.actions);
      }
    }
  }

  return actions;
}
