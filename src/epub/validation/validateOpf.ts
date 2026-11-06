import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { createIssue } from '../utils/issueFactory';
import {
  findCoverImageCandidate,
  isInvalidLanguageTag,
  isInvalidOpfDate,
} from '../utils/kindleCompatibility';
import { areEquivalentMediaTypes, guessMediaType } from '../utils/mediaTypes';
import { validateManifestFallbacks } from './validateManifestFallbacks';
import { validateRemoteManifestResources } from './validateRemoteManifestResources';

export function validateOpf(pkg: PackageDocumentInfo, loaded?: LoadedEpub): Issue[] {
  const issues: Issue[] = [];

  if (!pkg.metadata.title || !pkg.metadata.identifier) {
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

  if (!pkg.metadata.language) {
    issues.push(createIssue({
      code: 'OPF_LANGUAGE_MISSING',
      severity: 'warning',
      title: 'Idioma do OPF não declarado',
      detail: 'Não é seguro supor o idioma da obra. Informe manualmente o idioma correto.',
      file: pkg.opfPath,
      repairable: false,
    }));
  }

  if (pkg.metadata.language && isInvalidLanguageTag(pkg.metadata.language)) {
    issues.push(
      createIssue({
        code: 'OPF_LANGUAGE_INVALID',
        severity: 'warning',
        title: 'Idioma do OPF inválido ou genérico',
        detail:
          'O idioma declarado é genérico ou inválido. Revise o idioma da obra sem atribuir pt-BR automaticamente.',
        file: pkg.opfPath,
        context: pkg.metadata.language,
        repairable: false,
      }),
    );
  }

  if (pkg.metadata.date && isInvalidOpfDate(pkg.metadata.date)) {
    issues.push(
      createIssue({
        code: 'OPF_DATE_INVALID_FORMAT',
        severity: 'warning',
        title: 'Data do OPF em formato frágil',
        detail:
          'Datas com espaço, milissegundos soltos ou timezone fora do formato ISO podem falhar em conversores Kindle. O reparo tenta normalizar para YYYY-MM-DD.',
        file: pkg.opfPath,
        context: pkg.metadata.date,
        repairable: true,
      }),
    );
  }

  // EPUB 3.2, 3.3 e 3.4 continuam declarando package version="3.0"
  // conforme W3C: o atributo NÃO identifica a revisão secundária do padrão.
  // Não converter "3.4" automaticamente nem fingir suporte a perfil novo.
  if (pkg.version.trim() !== '1.0' && pkg.version.trim() !== '2.0' &&
      pkg.version.trim() !== '3.0') {
    issues.push(createIssue({
      code: 'OPF_PACKAGE_VERSION_UNSUPPORTED',
      severity: 'warning',
      title: 'Versão OPF não reconhecida pelas especificações EPUB 2/3',
      detail: 'O package deve declarar version="2.0" (EPUB 2) ou version="3.0" ' +
        '(EPUB 3.0/3.2/3.3/3.4). A revisão EPUB 3.x não é identificável ' +
        'por esse campo. Revisar a conformidade sem alterar a obra.',
      file: pkg.opfPath,
      context: pkg.version,
      repairable: false,
    }));
  }

  if (pkg.version.trim() === '1.0') {
    issues.push(
      createIssue({
        code: 'OPF_PACKAGE_VERSION_OLD',
        severity: 'warning',
        title: 'Versão OPF antiga',
        detail:
          'O pacote declara version="1.0". EPUB 2.0 é uma base mais segura para compatibilidade com leitores e conversores atuais.',
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
    const duplicatedId = Boolean(item.id && ids.has(item.id));
    if (!item.id || duplicatedId) {
      issues.push(
        createIssue({
          code: 'OPF_DUPLICATE_ID',
          severity: 'error',
          title: 'ID ausente ou duplicado no manifest',
          detail: `O item de href "${item.href}" precisa de um id único.`,
          file: pkg.opfPath,
          // Um ID duplicado pode ser alvo de spine, fallback ou refines: ambiguidade manual.
          repairable: !duplicatedId,
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

    const guessed = item.remote ? undefined : guessMediaType(item.resolvedPath);
    if (guessed && item.mediaType && !areEquivalentMediaTypes(item.mediaType, guessed)) {
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

    if (!item.exists && !item.remote) {
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

  const manifestById = new Map(pkg.manifest.map((item) => [item.id, item]));
  for (const item of pkg.manifest) {
    if (item.fallback && !manifestById.has(item.fallback)) {
      issues.push(createIssue({
        code: 'OPF_FALLBACK_MISSING',
        severity: 'warning',
        title: 'Fallback do manifest aponta para ID ausente',
        detail: `O item "${item.id}" usa fallback="${item.fallback}" inexistente.`,
        file: pkg.opfPath,
        repairable: false,
      }));
    }
    if (item.mediaOverlay && !manifestById.has(item.mediaOverlay)) {
      issues.push(createIssue({
        code: 'OPF_MEDIA_OVERLAY_MISSING',
        severity: 'warning',
        title: 'Media Overlay aponta para ID ausente',
        detail: `O item "${item.id}" aponta para media-overlay="${item.mediaOverlay}" inexistente.`,
        file: pkg.opfPath,
        repairable: false,
      }));
    }
    const seenFallbackIds = new Set<string>();
    let current = item;
    while (current.fallback) {
      if (seenFallbackIds.has(current.id)) {
        issues.push(createIssue({
          code: 'OPF_FALLBACK_CYCLE',
          severity: 'error',
          title: 'Ciclo de fallbacks no manifest',
          detail: `A cadeia de fallback iniciada em "${item.id}" contém uma referência circular.`,
          file: pkg.opfPath,
          repairable: false,
        }));
        break;
      }
      seenFallbackIds.add(current.id);
      const next = manifestById.get(current.fallback);
      if (!next) break;
      current = next;
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

  if (pkg.coverMetaId && !pkg.manifest.some((item) => item.id === pkg.coverMetaId)) {
    issues.push(
      createIssue({
        code: 'OPF_COVER_MANIFEST_MISMATCH',
        severity: 'warning',
        title: 'Metadado de capa aponta para item inexistente',
        detail:
          'O OPF possui meta name="cover", mas o content informado não corresponde a nenhum id do manifest.',
        file: pkg.opfPath,
        context: pkg.coverMetaId,
        repairable: true,
      }),
    );
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

  const coverCandidate = findCoverImageCandidate(pkg, loaded?.files);
  if (!pkg.coverMetaDeclared && coverCandidate) {
    issues.push(
      createIssue({
        code: 'OPF_COVER_META_MISSING',
        severity: 'warning',
        title: 'Imagem de capa não declarada no OPF',
        detail:
          'Há uma imagem com cara de capa no manifest, mas falta meta name="cover" apontando para ela. Kindle pode não exibir a capa na biblioteca.',
        file: pkg.opfPath,
        context: coverCandidate.resolvedPath,
        repairable: true,
      }),
    );
  }

  issues.push(...validateManifestFallbacks(pkg, loaded));
  issues.push(...validateRemoteManifestResources(pkg));
  return issues;
}
