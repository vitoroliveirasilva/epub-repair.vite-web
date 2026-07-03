import type { ValidationReport } from '../model/epubTypes';
import { loadEpub } from '../reader/loadEpub';
import { buildValidationReport } from '../utils/reportBuilder';
import { parsePackageDocument } from './opfParser';
import { detectOrphanResources } from './detectOrphans';
import { validateContentReferences } from './validateContentReferences';
import { validateCssReferences } from './validateCssReferences';
import { validateKindleCompatibility } from './validateKindleCompatibility';
import { validateNavigation } from './validateNavigation';
import { validateOpf } from './validateOpf';
import { validateZipAndOcf } from './validateZip';

export async function inspectEpub(fileName: string, bytes: Uint8Array): Promise<ValidationReport> {
  const loaded = await loadEpub(fileName, bytes);
  const issues = [...loaded.issues];

  if (!loaded.validZip) {
    return buildValidationReport({
      fileName,
      fileSize: bytes.length,
      validZip: false,
      zipEntries: loaded.rawEntries,
      issues,
    });
  }

  issues.push(...validateZipAndOcf(loaded));
  const parsed = parsePackageDocument(loaded);
  issues.push(...parsed.issues);

  if (parsed.packageInfo) {
    issues.push(...validateOpf(parsed.packageInfo, loaded));
    issues.push(...validateNavigation(loaded, parsed.packageInfo));
    issues.push(...validateContentReferences(loaded, parsed.packageInfo));
    issues.push(...validateCssReferences(loaded, parsed.packageInfo));
    issues.push(...validateKindleCompatibility(loaded, parsed.packageInfo));
    issues.push(...detectOrphanResources(loaded, parsed.packageInfo));
  }

  return buildValidationReport({
    fileName,
    fileSize: bytes.length,
    validZip: loaded.validZip,
    zipEntries: loaded.rawEntries,
    issues,
    ...(parsed.packageInfo ? { packageInfo: parsed.packageInfo } : {}),
  });
}
