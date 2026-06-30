import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { createIssue } from '../utils/issueFactory';
import { parseXml } from '../utils/xmlUtils';

export function validateNavigation(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  const issues: Issue[] = [];
  const isEpub3 = pkg.version.trim().startsWith('3');

  if (isEpub3 && !pkg.navItem) {
    issues.push(
      createIssue({
        code: 'NAV_MISSING',
        severity: 'error',
        title: 'Documento de navegação ausente',
        detail:
          'EPUB 3 precisa de um item com propriedade nav. O reparo pode gerar um nav.xhtml básico.',
        file: pkg.opfPath,
        repairable: true,
      }),
    );
  }

  if (pkg.navItem?.exists) {
    const navFile = loaded.files.get(pkg.navItem.resolvedPath);
    if (navFile) {
      try {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(navFile.bytes);
        const doc = parseXml(text, 'application/xhtml+xml');
        const hasToc = Array.from(doc.getElementsByTagName('*')).some(
          (element) =>
            element.localName === 'nav' &&
            /(^|\s)toc($|\s)/u.test(element.getAttribute('epub:type') ?? ''),
        );
        if (!hasToc) {
          issues.push(
            createIssue({
              code: 'NAV_INVALID',
              severity: 'warning',
              title: 'nav.xhtml sem navegação toc clara',
              detail:
                'O documento de navegação existe, mas não foi encontrado um nav com epub:type="toc".',
              file: pkg.navItem.resolvedPath,
              repairable: false,
            }),
          );
        }
      } catch (error) {
        issues.push(
          createIssue({
            code: 'NAV_INVALID',
            severity: 'warning',
            title: 'nav.xhtml inválido',
            detail:
              error instanceof Error
                ? error.message
                : 'O documento de navegação não pôde ser lido como XHTML.',
            file: pkg.navItem.resolvedPath,
            repairable: false,
          }),
        );
      }
    }
  }

  if (!pkg.ncxItem && !isEpub3) {
    issues.push(
      createIssue({
        code: 'NCX_MISSING',
        severity: 'error',
        title: 'toc.ncx ausente',
        detail: 'EPUB 2 precisa de um NCX para navegação legada.',
        file: pkg.opfPath,
        repairable: true,
      }),
    );
  } else if (pkg.ncxItem && !pkg.ncxItem.exists) {
    issues.push(
      createIssue({
        code: 'NCX_MISSING',
        severity: isEpub3 ? 'info' : 'error',
        title: 'toc.ncx declarado, mas ausente',
        detail: 'O OPF declara um NCX, mas o arquivo não existe no EPUB.',
        file: pkg.ncxItem.resolvedPath,
        repairable: true,
      }),
    );
  } else if (pkg.ncxItem?.exists) {
    const ncxFile = loaded.files.get(pkg.ncxItem.resolvedPath);
    if (ncxFile) {
      try {
        parseXml(new TextDecoder('utf-8', { fatal: false }).decode(ncxFile.bytes));
      } catch (error) {
        issues.push(
          createIssue({
            code: 'NCX_INVALID',
            severity: 'warning',
            title: 'toc.ncx inválido',
            detail: error instanceof Error ? error.message : 'O NCX não pôde ser lido como XML.',
            file: pkg.ncxItem.resolvedPath,
            repairable: false,
          }),
        );
      }
    }
  } else if (isEpub3) {
    issues.push(
      createIssue({
        code: 'NCX_MISSING',
        severity: 'info',
        title: 'NCX legado ausente',
        detail:
          'EPUB 3 não exige NCX, mas alguns fluxos antigos ainda lidam melhor quando ele existe.',
        file: pkg.opfPath,
        repairable: true,
      }),
    );
  }

  return issues;
}
