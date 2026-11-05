import type { RepairOptions, ValidationReport } from '../epub';

/** Exibe motivos objetivos antes de executar alterações editoriais perceptíveis. */
export function potentialEditorialChanges(
  options: RepairOptions,
  report: ValidationReport | undefined,
): string[] {
  const changes: string[] = [];
  const codes = new Set(report?.issues.map((issue) => issue.code) ?? []);

  if (options.replaceMissingImagesWithText &&
    codes.has('CONTENT_MISSING_RESOURCE')) {
    changes.push('Imagens ausentes podem ser substituídas por texto visível.');
  }
  if (options.removeRemoteResourceLinks) {
    changes.push('Links externos e recursos HTTP/HTTPS podem ser removidos, alterando a leitura offline.');
  }
  if (!options.conservativeMode && options.kindleSafeMode &&
    (codes.has('CONTENT_UNSAFE_EMBED') || codes.has('CONTENT_KINDLE_EMBED_BROKEN'))) {
    changes.push('Recursos interativos e proprietários podem ser removidos ou virarem marcadores.');
  }
  if (!options.conservativeMode && options.sanitizeScripts &&
    (codes.has('CONTENT_SCRIPTED') || codes.has('CONTENT_UNSAFE_STYLE') ||
      codes.has('CONTENT_UNSAFE_URL'))) {
    changes.push('Scripts, eventos e URLs executáveis podem ser neutralizados.');
  }
  return changes;
}
