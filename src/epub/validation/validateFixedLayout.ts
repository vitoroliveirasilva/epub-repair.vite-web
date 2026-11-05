import type { LoadedEpub } from '../model/epubTypes';
import type { Issue, IssueCode } from '../model/issueTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { createIssue } from '../utils/issueFactory';
import { parseXml } from '../utils/xmlUtils';

/**
 * Inspeção somente-leitura dos requisitos de dimensões do EPUB 3 fixed-layout.
 * Não transforma SVG, altera zoom ou tenta inferir tamanhos de páginas.
 */
export function validateFixedLayout(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  if (!pkg.version.startsWith('3')) return [];
  const opfBytes = loaded.files.get(pkg.opfPath)?.bytes;
  if (!opfBytes) return [];

  const issues: Issue[] = [];
  const warn = (code: IssueCode, file: string, title: string, detail: string) =>
    issues.push(createIssue({ code, file, title, detail, severity: 'warning', repairable: false }));

  let doc: Document;
  try {
    doc = parseXml(new TextDecoder('utf-8', { fatal: true }).decode(opfBytes));
  } catch {
    return issues; // O parser OPF já reporta XML inválido.
  }
  const elements = Array.from(doc.getElementsByTagName('*'));
  const globalLayouts = elements.filter((element) =>
    element.localName === 'meta' &&
    element.getAttribute('property') === 'rendition:layout');
  const globalLayout = globalLayouts[0]?.textContent?.trim();
  if (globalLayouts.length > 1 || globalLayouts.some((element) =>
    element.hasAttribute('refines')) ||
    (globalLayout !== undefined && globalLayout !== 'pre-paginated' &&
      globalLayout !== 'reflowable')) {
    warn('FIXED_LAYOUT_INVALID_PROPERTY', pkg.opfPath,
      'Declaração fixed-layout inválida',
      'rendition:layout deve ser único, sem refines e com valor pre-paginated ou reflowable.');
  }

  const itemrefs = elements.filter((element) => element.localName === 'itemref');
  for (const [index, spine] of pkg.spine.entries()) {
    const node = itemrefs[index];
    const properties = (node?.getAttribute('properties') ?? '').split(/\s+/u);
    const fixedOverride = properties.includes('rendition:layout-pre-paginated');
    const reflowOverride = properties.includes('rendition:layout-reflowable');
    if (fixedOverride && reflowOverride) {
      warn('FIXED_LAYOUT_INVALID_PROPERTY', pkg.opfPath,
        'Propriedades de layout contraditórias',
        'O mesmo itemref não pode declarar layout fixo e reflowable.');
      continue;
    }
    if (!fixedOverride && (reflowOverride || globalLayout !== 'pre-paginated')) continue;
    const item = spine.manifestItem;
    if (!item?.exists) continue;
    const bytes = loaded.files.get(item.resolvedPath)?.bytes;
    if (!bytes) continue;

    let content: Document;
    try {
      content = parseXml(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes)
          .replace(/&nbsp;/giu, '&#160;'),
      );
    } catch {
      continue; // XML malformado já recebe diagnóstico na inspeção de conteúdo.
    }
    if (item.mediaType === 'application/xhtml+xml') {
      const head = Array.from(content.getElementsByTagName('*'))
        .find((element) => element.localName === 'head');
      const viewport = head && Array.from(head.getElementsByTagName('*'))
        .find((element) => element.localName === 'meta' &&
          element.getAttribute('name')?.trim() === 'viewport');
      if (!viewport || !validViewport(viewport.getAttribute('content') ?? '')) {
        warn('FIXED_LAYOUT_MISSING_VIEWPORT', item.resolvedPath,
          'Página fixed-layout sem viewport válido',
          'A primeira meta viewport em head deve declarar width e height positivos e únicos.');
      }
    } else if (item.mediaType === 'image/svg+xml') {
      const root = content.documentElement;
      const values = root.getAttribute('viewBox')?.trim().split(/[\s,]+/u)
        .map(Number) ?? [];
      if (root.localName !== 'svg' || values.length !== 4 ||
          values.some((number) => !Number.isFinite(number)) ||
          (values[2] ?? 0) <= 0 || (values[3] ?? 0) <= 0) {
        warn('FIXED_LAYOUT_INVALID_VIEWBOX', item.resolvedPath,
          'Página SVG fixed-layout sem viewBox válido',
          'O SVG do spine precisa de viewBox com origem e dimensões positivas.');
      }
    }
  }
  return issues;
}

function validViewport(value: string): boolean {
  const attributes = value.split(/[;,]/u)
    .map((part) => part.trim().match(/^(width|height)\s*=\s*(\d+(?:\.\d+)?)$/iu))
    .filter((result): result is RegExpMatchArray => Boolean(result));
  const widths = attributes.filter((match) => match[1]?.toLowerCase() === 'width');
  const heights = attributes.filter((match) => match[1]?.toLowerCase() === 'height');
  return widths.length === 1 && heights.length === 1 &&
    Number(widths[0]?.[2]) > 0 && Number(heights[0]?.[2]) > 0;
}
