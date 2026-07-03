import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { HTML_MEDIA_TYPES } from '../utils/constants';
import { createIssue } from '../utils/issueFactory';
import { isJpegMediaType, isProgressiveJpeg } from '../utils/kindleCompatibility';
import { resolveReference } from '../utils/pathUtils';
import { childElementsByLocalName, findByLocalName, getAttr, parseXml } from '../utils/xmlUtils';

const TEXT_DECODER = new TextDecoder('utf-8', { fatal: false });
const MAX_CONTEXT_ITEMS = 5;

export function validateKindleCompatibility(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  return [
    ...validateNcxKindleRules(loaded, pkg),
    ...validateXhtmlKindleRules(loaded, pkg),
    ...validateImageKindleRules(loaded, pkg),
  ];
}

function validateNcxKindleRules(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  const issues: Issue[] = [];
  if (!pkg.ncxItem?.exists) return issues;

  const ncxEntry = loaded.files.get(pkg.ncxItem.resolvedPath);
  if (!ncxEntry) return issues;

  let doc: Document;
  try {
    doc = parseXml(TEXT_DECODER.decode(ncxEntry.bytes));
  } catch {
    return issues;
  }

  const navPoints = findByLocalName(doc, 'navPoint');
  const seenPlayOrders = new Map<number, number>();
  let previousPlayOrder = 0;
  let hasOutOfOrder = false;
  let hasDuplicate = false;
  const ncxContentPaths = new Set<string>();
  const missingContentTargets: string[] = [];

  for (const [index, navPoint] of navPoints.entries()) {
    const rawPlayOrder = getAttr(navPoint, 'playOrder');
    const playOrder = rawPlayOrder ? Number.parseInt(rawPlayOrder, 10) : Number.NaN;

    if (!Number.isInteger(playOrder) || playOrder < 1 || playOrder < previousPlayOrder) {
      hasOutOfOrder = true;
    }
    if (Number.isInteger(playOrder)) {
      const count = seenPlayOrders.get(playOrder) ?? 0;
      if (count > 0) hasDuplicate = true;
      seenPlayOrders.set(playOrder, count + 1);
      previousPlayOrder = Math.max(previousPlayOrder, playOrder);
    }

    const content = childElementsByLocalName(navPoint, 'content')[0];
    const src = getAttr(content, 'src');
    if (!src) continue;

    const resolved = resolveReference(pkg.ncxItem.resolvedPath, src);
    if (resolved.safe && loaded.files.has(resolved.path)) {
      ncxContentPaths.add(resolved.path);
    } else if (missingContentTargets.length < MAX_CONTEXT_ITEMS) {
      missingContentTargets.push(src);
    }

    if (index > 10000) break;
  }

  if (hasDuplicate) {
    issues.push(
      createIssue({
        code: 'NCX_PLAYORDER_DUPLICATE',
        severity: 'warning',
        title: 'toc.ncx tem playOrder duplicado',
        detail:
          'A navegação NCX possui números playOrder repetidos. Isso pode bagunçar o sumário em conversores Kindle.',
        file: pkg.ncxItem.resolvedPath,
        repairable: true,
      }),
    );
  }

  if (hasOutOfOrder) {
    issues.push(
      createIssue({
        code: 'NCX_PLAYORDER_OUT_OF_ORDER',
        severity: 'warning',
        title: 'toc.ncx tem playOrder fora de ordem',
        detail:
          'A sequência de navegação NCX não está crescente e limpa. O reparo pode renumerar os navPoints.',
        file: pkg.ncxItem.resolvedPath,
        repairable: true,
      }),
    );
  }

  if (missingContentTargets.length > 0) {
    issues.push(
      createIssue({
        code: 'NCX_CONTENT_MISSING_RESOURCE',
        severity: 'warning',
        title: 'toc.ncx aponta para conteúdo ausente',
        detail:
          'Um ou mais itens do sumário NCX apontam para arquivos que não existem ou têm caminho inseguro.',
        file: pkg.ncxItem.resolvedPath,
        context: missingContentTargets.join(', '),
        repairable: true,
      }),
    );
  }

  const spineHtmlPaths = pkg.spine
    .map((item) => item.manifestItem)
    .filter((item): item is NonNullable<typeof item> =>
      Boolean(item?.exists && HTML_MEDIA_TYPES.has(item.mediaType)),
    )
    .map((item) => item.resolvedPath);
  const missingFromNcx = spineHtmlPaths.filter((path) => !ncxContentPaths.has(path));

  if (spineHtmlPaths.length > 0 && missingFromNcx.length > 0) {
    issues.push(
      createIssue({
        code: 'NCX_SPINE_MISSING_ITEMS',
        severity: 'info',
        title: 'toc.ncx não cobre todos os itens do spine',
        detail:
          'Há documentos na ordem de leitura que não aparecem no NCX. O livro pode abrir, mas a navegação fica incompleta.',
        file: pkg.ncxItem.resolvedPath,
        context: summarizePaths(missingFromNcx),
        repairable: true,
      }),
    );
  }

  return issues;
}

function validateXhtmlKindleRules(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  const issues: Issue[] = [];

  for (const item of pkg.manifest) {
    if (!item.exists || !HTML_MEDIA_TYPES.has(item.mediaType)) continue;
    const entry = loaded.files.get(item.resolvedPath);
    if (!entry) continue;

    const text = TEXT_DECODER.decode(entry.bytes);
    if (/&nbsp;/iu.test(text)) {
      issues.push(
        createIssue({
          code: 'XHTML_NBSP_ENTITY',
          severity: 'warning',
          title: 'XHTML usa entidade &nbsp;',
          detail:
            'A entidade &nbsp; pode quebrar parsing XML quando não declarada. O reparo troca por entidade numérica segura.',
          file: item.resolvedPath,
          repairable: true,
        }),
      );
    }

    const htmlOpenTag = text.match(/<html\b([^>]*)>/iu);
    const htmlAttrs = htmlOpenTag?.[1] ?? '';
    if (htmlOpenTag && !hasNonEmptyLanguageAttribute(htmlAttrs)) {
      issues.push(
        createIssue({
          code: 'XHTML_LANG_MISSING',
          severity: 'info',
          title: 'XHTML sem idioma declarado',
          detail:
            'Adicionar lang/xml:lang ajuda leitores e conversores a identificar corretamente o idioma do conteúdo.',
          file: item.resolvedPath,
          repairable: true,
        }),
      );
    }

    const suspiciousMeta = findSuspiciousContentTypeMeta(text);
    if (suspiciousMeta) {
      issues.push(
        createIssue({
          code: 'XHTML_CONTENT_TYPE_SUSPICIOUS',
          severity: 'warning',
          title: 'Meta Content-Type suspeito',
          detail:
            'O XHTML contém meta http-equiv="Content-Type" com valor estranho para EPUB. O reparo normaliza esse metadado.',
          file: item.resolvedPath,
          context: suspiciousMeta,
          repairable: true,
        }),
      );
    }
  }

  return issues;
}

function validateImageKindleRules(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  const issues: Issue[] = [];

  for (const item of pkg.manifest) {
    if (!item.exists || !isJpegMediaType(item.mediaType)) continue;
    const entry = loaded.files.get(item.resolvedPath);
    if (!entry || !isProgressiveJpeg(entry.bytes)) continue;

    issues.push(
      createIssue({
        code: 'IMAGE_PROGRESSIVE_JPEG',
        severity: 'info',
        title: 'JPEG progressivo detectado',
        detail:
          'JPEG progressivo costuma funcionar em leitores modernos, mas alguns fluxos antigos de conversão preferem JPEG baseline.',
        file: item.resolvedPath,
        repairable: true,
      }),
    );
  }

  return issues;
}

function hasNonEmptyLanguageAttribute(attrs: string): boolean {
  const lang = readAttributeFromText(attrs, 'lang');
  const xmlLang = readAttributeFromText(attrs, 'xml:lang');
  return Boolean(lang?.trim() || xmlLang?.trim());
}

function readAttributeFromText(text: string, name: string): string | undefined {
  const pattern = new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, 'iu');
  return pattern.exec(text)?.[2] ?? undefined;
}

function findSuspiciousContentTypeMeta(text: string): string | undefined {
  const metaPattern = /<meta\b[^>]*http-equiv\s*=\s*(["'])?content-type\1?[^>]*>/giu;
  for (const match of text.matchAll(metaPattern)) {
    const meta = match[0];
    const content = readAttribute(meta, 'content');
    if (!content) continue;
    const normalized = content.trim().toLowerCase();
    const valid = /^(?:application\/xhtml\+xml|text\/html)(?:\s*;\s*charset\s*=\s*[-\w]+)?$/iu.test(
      normalized,
    );
    if (!valid) return content.slice(0, 160);
  }
  return undefined;
}

function readAttribute(tag: string, name: string): string | undefined {
  const pattern = new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, 'iu');
  return pattern.exec(tag)?.[2]?.trim() || undefined;
}

function summarizePaths(paths: string[]): string {
  const visible = paths.slice(0, MAX_CONTEXT_ITEMS);
  const suffix = paths.length > visible.length ? `, +${paths.length - visible.length}` : '';
  return `${visible.join(', ')}${suffix}`;
}
