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
  if (options.sanitizeScripts &&
    (codes.has('CONTENT_SCRIPTED') || codes.has('CONTENT_UNSAFE_STYLE') ||
      codes.has('CONTENT_UNSAFE_URL'))) {
    changes.push('Scripts, eventos e URLs executáveis podem ser neutralizados.');
  }
  return changes;
}


/** Descreve as alterações prováveis antes da confirmação, sem inventar resultados. */
export function buildRepairConsentMessage(
  options: RepairOptions,
  report: ValidationReport | undefined,
): string | undefined {
  const categories = potentialEditorialChanges(options, report);
  if (categories.length === 0) return undefined;
  const relevantCodes = new Set([
    'CONTENT_MISSING_RESOURCE', 'CONTENT_SCRIPTED', 'CONTENT_UNSAFE_STYLE',
    'CONTENT_UNSAFE_URL', 'CONTENT_UNSAFE_EMBED', 'CONTENT_KINDLE_EMBED_BROKEN',
  ]);
  const files = Array.from(new Set((report?.issues ?? [])
    .filter((issue) => relevantCodes.has(issue.code) && Boolean(issue.file))
    .map((issue) => issue.file!)));
  const limited = files.slice(0, 8);
  const destinations = limited.length
    ? '\nArquivos possivelmente afetados:\n' +
      limited.map((file) => '- ' + file).join('\n') +
      (files.length > limited.length ? '\n- e mais ' + (files.length - limited.length) + ' arquivo(s)' : '')
    : '';
  return 'Esta operação pode modificar o conteúdo do livro:\n\n' +
    categories.map((reason) => '- ' + reason).join('\n') +
    destinations + '\n\nAs alterações só serão aplicadas a uma nova cópia. ' +
    'Deseja continuar?';
}
