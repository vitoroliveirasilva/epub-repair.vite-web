import type { Issue } from '../model/issueTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { createIssue } from '../utils/issueFactory';
import { guessMediaType } from '../utils/mediaTypes';

export function validateOpf(pkg: PackageDocumentInfo): Issue[] {
  const issues: Issue[] = [];

  if (!pkg.metadata.title || !pkg.metadata.language || !pkg.metadata.identifier) {
    issues.push(
      createIssue({
        code: 'OPF_METADATA_MISSING',
        severity: 'warning',
        title: 'Metadados básicos incompletos',
        detail:
          'Título, idioma e identificador ajudam leitores e serviços de envio a interpretar o livro corretamente.',
        file: pkg.opfPath,
        repairable: true,
      }),
    );
  }

  if (pkg.manifest.length === 0) {
    issues.push(
      createIssue({
        code: 'OPF_MANIFEST_EMPTY',
        severity: 'fatal',
        title: 'Manifest vazio',
        detail: 'O OPF não lista nenhum recurso do livro.',
        file: pkg.opfPath,
        repairable: false,
      }),
    );
  }

  if (pkg.spine.length === 0) {
    issues.push(
      createIssue({
        code: 'OPF_SPINE_EMPTY',
        severity: 'fatal',
        title: 'Spine vazio',
        detail: 'O OPF não define a ordem de leitura.',
        file: pkg.opfPath,
        repairable: false,
      }),
    );
  }

  const ids = new Set<string>();
  const hrefs = new Set<string>();

  for (const item of pkg.manifest) {
    if (!item.id || ids.has(item.id)) {
      issues.push(
        createIssue({
          code: 'OPF_DUPLICATE_ID',
          severity: 'error',
          title: 'ID ausente ou duplicado no manifest',
          detail: `O item de href "${item.href}" precisa de um id único.`,
          file: pkg.opfPath,
          repairable: true,
        }),
      );
    }
    if (item.id) ids.add(item.id);

    if (!item.href || hrefs.has(item.resolvedPath)) {
      issues.push(
        createIssue({
          code: 'OPF_DUPLICATE_HREF',
          severity: 'warning',
          title: 'Href ausente ou duplicado no manifest',
          detail: `O caminho "${item.href}" aparece duplicado ou vazio no manifest.`,
          file: pkg.opfPath,
          repairable: true,
        }),
      );
    }
    if (item.href) hrefs.add(item.resolvedPath);

    if (item.href && !item.pathSafe) {
      issues.push(
        createIssue({
          code: 'OPF_UNSAFE_HREF',
          severity: 'error',
          title: 'Href inseguro no manifest',
          detail:
            item.pathReason ??
            'O manifest aponta para um caminho interno que não é seguro preservar no EPUB.',
          file: pkg.opfPath,
          context: item.href,
          repairable: true,
        }),
      );
    }

    const guessed = guessMediaType(item.resolvedPath);
    if (guessed && item.mediaType && item.mediaType !== guessed && item.mediaType !== 'image/jpg') {
      issues.push(
        createIssue({
          code: 'OPF_BAD_MEDIA_TYPE',
          severity: 'warning',
          title: 'Media type possivelmente incorreto',
          detail: `O item "${item.href}" usa "${item.mediaType}", mas pela extensão parece "${guessed}".`,
          file: pkg.opfPath,
          repairable: true,
        }),
      );
    }

    if (!item.exists) {
      issues.push(
        createIssue({
          code: 'OPF_MISSING_RESOURCE',
          severity: 'error',
          title: 'Arquivo listado no manifest não existe',
          detail: `O manifest referencia "${item.href}", mas esse arquivo não está dentro do EPUB.`,
          file: item.resolvedPath,
          repairable: true,
        }),
      );
    }
  }

  for (const item of pkg.spine) {
    if (!item.idref || !item.manifestItem) {
      issues.push(
        createIssue({
          code: 'OPF_SPINE_BAD_IDREF',
          severity: 'error',
          title: 'Spine aponta para item inexistente',
          detail: `O itemref "${item.idref}" não existe no manifest.`,
          file: pkg.opfPath,
          repairable: true,
        }),
      );
    }
  }

  if (pkg.coverItem && !pkg.coverItem.exists) {
    issues.push(
      createIssue({
        code: 'OPF_COVER_MISSING',
        severity: 'warning',
        title: 'Capa declarada não existe',
        detail:
          'O OPF declara uma imagem de capa, mas o arquivo não foi encontrado dentro do EPUB.',
        file: pkg.coverItem.resolvedPath,
        repairable: true,
      }),
    );
  }

  return issues;
}
