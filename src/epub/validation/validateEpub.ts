import type { LoadedEpub, ValidationReport } from '../model/epubTypes';
import { loadEpub } from '../reader/loadEpub';
import { buildCoverReportInfo } from '../utils/kindleCompatibility';
import { buildValidationReport } from '../utils/reportBuilder';
import { parsePackageDocument } from './opfParser';
import { detectOrphanResources } from './detectOrphans';
import { validateContentReferences } from './validateContentReferences';
import { validateCssReferences } from './validateCssReferences';
import { validateKindleCompatibility } from './validateKindleCompatibility';
import { validateNavigation } from './validateNavigation';
import { validateInternalAnchors } from './validateInternalAnchors';
import { validateFootnotes } from './validateFootnotes';
import { validateOpf } from './validateOpf';
import { validateZipAndOcf } from './validateZip';
import { validateSuspiciousResources } from './validateSuspiciousResources';
import { validatePackageSemantics } from './validatePackageSemantics';
import { validateImageResources } from './validateImageResources';
import { validateAccessibility } from './validateAccessibility';
import { validateCssQuality } from './validateCssQuality';
import { validateCoverConsistency } from './validateCoverConsistency';
import { validateDeclaredScripts } from './validateDeclaredScripts';
import { validateUndeclaredActiveContent } from './validateUndeclaredActiveContent';
import { validateMediaOverlays } from './validateMediaOverlays';
import { validateFixedLayout } from './validateFixedLayout';
import { validateEditorialOcrQuality } from './validateEditorialOcrQuality';

export async function inspectEpub(fileName: string, bytes: Uint8Array): Promise<ValidationReport> {
  const loaded = await loadEpub(fileName, bytes);
  return inspectLoadedEpub(fileName, bytes.length, loaded);
}

/**
 * Inspeciona a mesma instância descompactada usada pelo reparo. Evita abrir
 * o ZIP duas vezes e reduz o pico de buffers duplicados em EPUBs maiores.
 */
export function inspectLoadedEpub(
  fileName: string,
  fileSize: number,
  loaded: LoadedEpub,
): ValidationReport {
  const issues = [...loaded.issues];

  if (!loaded.validZip) {
    return buildValidationReport({
      fileName,
      fileSize,
      validZip: false,
      zipEntries: loaded.rawEntries,
      issues,
    });
  }

  issues.push(...validateZipAndOcf(loaded));
  issues.push(...validateSuspiciousResources(loaded));
  const parsed = parsePackageDocument(loaded);
  issues.push(...parsed.issues);

  if (parsed.packageInfo) {
    issues.push(...validateOpf(parsed.packageInfo, loaded));
    issues.push(...validatePackageSemantics(loaded, parsed.packageInfo));
    issues.push(...validateCoverConsistency(loaded, parsed.packageInfo));
    issues.push(...validateDeclaredScripts(loaded, parsed.packageInfo));
    issues.push(...validateUndeclaredActiveContent(loaded, parsed.packageInfo));
    issues.push(...validateNavigation(loaded, parsed.packageInfo));
    issues.push(...validateInternalAnchors(loaded, parsed.packageInfo));
    issues.push(...validateFootnotes(loaded, parsed.packageInfo));
    issues.push(...validateContentReferences(loaded, parsed.packageInfo));
    issues.push(...validateCssReferences(loaded, parsed.packageInfo));
    issues.push(...validateCssQuality(loaded, parsed.packageInfo));
    issues.push(...validateImageResources(loaded, parsed.packageInfo));
    issues.push(...validateMediaOverlays(loaded, parsed.packageInfo));
    issues.push(...validateFixedLayout(loaded, parsed.packageInfo));
    issues.push(...validateAccessibility(loaded, parsed.packageInfo));
    issues.push(...validateEditorialOcrQuality(loaded, parsed.packageInfo));
    issues.push(...validateKindleCompatibility(loaded, parsed.packageInfo));
    issues.push(...detectOrphanResources(loaded, parsed.packageInfo));
  }

  return buildValidationReport({
    fileName,
    fileSize,
    validZip: loaded.validZip,
    zipEntries: loaded.rawEntries,
    issues,
    ...(parsed.packageInfo
      ? {
          packageInfo: parsed.packageInfo,
          cover: buildCoverReportInfo(parsed.packageInfo, loaded.files),
        }
      : {}),
  });
}
