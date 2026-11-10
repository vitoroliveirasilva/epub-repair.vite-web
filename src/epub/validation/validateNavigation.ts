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
        const hasToc = Array.from(doc.getElementsByTagName('*')).some((element) => {
          if (element.localName !== 'nav') return false;
          const navType = element.getAttributeNS('http://www.idpf.org/2007/ops', 'type')
            ?? element.getAttribute('epub:type')
            ?? '';
          return /(^|\s)toc($|\s)/u.test(navType);
        });
        if (hasToc) {
          const toc = Array.from(doc.getElementsByTagName('*')).find((element) => {
            if (element.localName !== 'nav') return false;
            const navType = element.getAttributeNS('http://www.idpf.org/2007/ops', 'type')
              ?? element.getAttribute('epub:type') ?? '';
            return /(^|\s)toc($|\s)/u.test(navType);
          });
          const hasLinks = toc && Array.from(toc.getElementsByTagName('*'))
            .some((element) => element.localName === 'a' && Boolean(element.getAttribute('href')));
          if (!hasLinks) {
            issues.push(createIssue({
              code: 'NAV_EMPTY',
              severity: 'warning',
              title: 'Índice EPUB 3 sem links navegáveis',
              detail: 'O nav.xhtml possui um toc, mas não contém destinos navegáveis.',
              file: pkg.navItem.resolvedPath,
              repairable: false,
            }));
          }
        }
        
        const navs = Array.from(doc.getElementsByTagName('*'))
          .filter((node) => node.localName === 'nav');
        for (const kind of ['toc', 'page-list', 'landmarks']) {
          const selected = navs.filter((node) => {
            const type = node.getAttributeNS('http://www.idpf.org/2007/ops', 'type')
              ?? node.getAttribute('epub:type') ?? '';
            return type.split(/\s+/u).includes(kind);
          });
          if (selected.length > 1) {
            issues.push(createIssue({
              code: 'NAV_DUPLICATE_TYPE',
              severity: 'warning',
              title: 'Navegação EPUB 3 duplicada',
              detail: `O documento contém mais de um nav do tipo "${kind}".`,
              file: pkg.navItem.resolvedPath,
              context: kind,
              repairable: false,
            }));
          }
          for (const nav of selected) {
            const lists = Array.from(nav.children).filter((node) => node.localName === 'ol');
            const entries = lists[0] ? Array.from(lists[0].children) : [];
            if (lists.length !== 1 || entries.length === 0 ||
              entries.some((entry) => entry.localName !== 'li') ||
              (lists[0] ? !validNavigationList(lists[0]) : true)) {
              issues.push(createIssue({
                code: 'NAV_INVALID_STRUCTURE',
                severity: 'warning',
                title: 'Lista de navegação malformada',
                detail: `A navegação "${kind}" exige um ol direto contendo li.`,
                file: pkg.navItem.resolvedPath,
                context: kind,
                repairable: false,
              }));
            }
            if (kind === 'landmarks') {
              const missingType = Array.from(nav.getElementsByTagName('*'))
                .some((node) => node.localName === 'a' &&
                  !(node.getAttributeNS('http://www.idpf.org/2007/ops', 'type')
                    ?? node.getAttribute('epub:type') ?? '').trim());
              if (missingType) {
                issues.push(createIssue({
                  code: 'NAV_LANDMARK_TYPE_MISSING',
                  severity: 'warning',
                  title: 'Landmark sem tipo semântico',
                  detail: 'Todo link de landmarks precisa de epub:type.',
                  file: pkg.navItem.resolvedPath,
                  repairable: false,
                }));
              }
            }
          }
        }
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
  }

  return issues;
}






function validNavigationList(list: Element, depth = 0): boolean {
  
  if (depth > 80 || list.localName !== 'ol') return false;
  const children = Array.from(list.children);
  if (children.length === 0) return false;
  for (const li of children) {
    if (li.localName !== 'li') return false;
    const contents = Array.from(li.children);
    const labels = contents.filter((node) =>
      node.localName === 'a' || node.localName === 'span');
    const nested = contents.filter((node) => node.localName === 'ol');
    if (labels.length !== 1 || nested.length > 1 ||
        contents.some((node) => !['a', 'span', 'ol'].includes(node.localName))) {
      return false;
    }
    if (labels[0]?.localName === 'a' && !labels[0].getAttribute('href')?.trim()) {
      return false;
    }
    if (nested.length > 0 &&
        (contents.indexOf(nested[0]!) <= contents.indexOf(labels[0]!) ||
         !validNavigationList(nested[0]!, depth + 1))) return false;
  }
  return true;
}
