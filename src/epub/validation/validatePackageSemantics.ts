import type { LoadedEpub } from '../model/epubTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import type { Issue } from '../model/issueTypes';
import { createIssue } from '../utils/issueFactory';
import { findByLocalName, findFirstByLocalName, parseXml } from '../utils/xmlUtils';
import { validateManifestContentProperties } from './validateManifestContentProperties';

const MODIFIED_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;

/** Diagnósticos conformes ao OPF sem inventar ordem, identificadores ou metadados. */
export function validatePackageSemantics(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  const bytes = loaded.files.get(pkg.opfPath)?.bytes;
  if (!bytes) return [];
  let doc: Document;
  try {
    doc = parseXml(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
  } catch {
    return []; // OPF_INVALID_XML já é emitido pelo parser.
  }
  const issues: Issue[] = [];
  const packageElement = findFirstByLocalName(doc, 'package');
  const metadata = findFirstByLocalName(doc, 'metadata');
  const spine = findFirstByLocalName(doc, 'spine');
  const isEpub3 = pkg.version.startsWith('3');

  const key = packageElement?.getAttribute('unique-identifier')?.trim();
  const unique = metadata
    ? findByLocalName(metadata, 'identifier').filter((element) =>
      element.getAttribute('id') === key && Boolean(element.textContent?.trim()))
    : [];
  if (!key || unique.length !== 1) {
    issues.push(createIssue({
      code: 'OPF_UNIQUE_IDENTIFIER_INVALID',
      severity: 'warning',
      title: 'Identificador principal do pacote ausente ou sem alvo único',
      detail: 'unique-identifier precisa referenciar o id de um dc:identifier com valor.',
      file: pkg.opfPath,
      repairable: false,
    }));
  }

  if (isEpub3) {
    const modified = metadata
      ? findByLocalName(metadata, 'meta')
        .filter((element) => element.getAttribute('property') === 'dcterms:modified')
      : [];
    const value = modified[0]?.textContent?.trim() ?? '';
    if (modified.length !== 1 || !MODIFIED_UTC.test(value) ||
      Number.isNaN(Date.parse(value))) {
      issues.push(createIssue({
        code: 'OPF_MODIFIED_INVALID',
        severity: 'warning',
        title: 'Data de modificação obrigatória ausente ou fora de UTC',
        detail: 'EPUB 3 exige um único dcterms:modified no formato YYYY-MM-DDThh:mm:ssZ.',
        file: pkg.opfPath,
        repairable: false,
      }));
    }

    const knownIds = new Set(Array.from(doc.getElementsByTagName('*'))
      .map((element) => element.getAttribute('id')).filter(Boolean));
    for (const meta of metadata ? findByLocalName(metadata, 'meta') : []) {
      const target = meta.getAttribute('refines');
      if (target?.startsWith('#') && !knownIds.has(target.slice(1))) {
        issues.push(createIssue({
          code: 'OPF_REFINES_MISSING_TARGET',
          severity: 'warning',
          title: 'Metadado refinado aponta para identificador inexistente',
          detail: `O refines="${target}" não identifica nenhum elemento do OPF.`,
          file: pkg.opfPath,
          context: target,
          repairable: false,
        }));
      }
    }

    const navItems = pkg.manifest.filter((item) => item.properties.includes('nav'));
    const coverItems = pkg.manifest.filter((item) => item.properties.includes('cover-image'));
    if (navItems.length > 1 || navItems.some((item) =>
      item.mediaType.toLowerCase() !== 'application/xhtml+xml') ||
      coverItems.length > 1 || coverItems.some((item) =>
        !item.mediaType.toLowerCase().startsWith('image/'))) {
      issues.push(createIssue({
        code: 'OPF_MANIFEST_PROPERTY_INVALID',
        severity: 'warning',
        title: 'Propriedades do manifest EPUB 3 inconsistentes',
        detail: 'nav deve apontar para um único XHTML e cover-image para no máximo uma imagem.',
        file: pkg.opfPath,
        repairable: false,
      }));
    }
  }

  const direction = spine?.getAttribute('page-progression-direction');
  if (direction && !['ltr', 'rtl', 'default'].includes(direction)) {
    issues.push(createIssue({
      code: 'OPF_SPINE_DIRECTION_INVALID',
      severity: 'warning',
      title: 'Direção global de leitura inválida',
      detail: 'page-progression-direction admite ltr, rtl ou default; não será alterado.',
      file: pkg.opfPath,
      repairable: false,
    }));
  }
  const linearValues = pkg.spine.map((item) => item.linear).filter(Boolean);
  if (linearValues.some((value) => value !== 'yes' && value !== 'no') ||
    (pkg.spine.length > 0 && pkg.spine.every((item) => item.linear === 'no'))) {
    issues.push(createIssue({
      code: 'OPF_SPINE_LINEAR_INVALID',
      severity: 'warning',
      title: 'Ordem principal de leitura sem itens lineares válidos',
      detail: 'linear precisa ser yes/no e deve existir pelo menos uma entrada principal.',
      file: pkg.opfPath,
      repairable: false,
    }));
  }

  issues.push(...validateManifestContentProperties(loaded, pkg));
  return issues;
}
