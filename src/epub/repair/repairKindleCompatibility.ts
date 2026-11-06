import type { PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction, RepairOptions } from '../model/repairTypes';
import { HTML_MEDIA_TYPES } from '../utils/constants';
import { decodeUtf8ForRewrite } from '../utils/textEncoding';
import { isInvalidLanguageTag, normalizeLanguageTag } from '../utils/kindleCompatibility';
import {
  childElementsByLocalName,
  findByLocalName,
  getAttr,
  parseXml,
  serializeXmlPreservingDeclaration,
} from '../utils/xmlUtils';

const TEXT_ENCODER = new TextEncoder();

export function repairKindleCompatibility(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
  options: Pick<RepairOptions, 'conservativeMode'>,
): RepairAction[] {
  const actions = [...repairNcxCompatibility(files, pkg)];
  if (!options.conservativeMode) actions.push(...repairXhtmlCompatibility(files, pkg));
  return actions;
}

function repairNcxCompatibility(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
): RepairAction[] {
  const actions: RepairAction[] = [];
  if (!pkg.ncxItem?.exists) return actions;

  const bytes = files.get(pkg.ncxItem.resolvedPath);
  if (!bytes) return actions;

  let doc: Document;
  let ncxSource: string;
  try {
    ncxSource = decodeUtf8ForRewrite(bytes, pkg.ncxItem.resolvedPath);
    doc = parseXml(ncxSource);
  } catch {
    return actions;
  }

  // O NCX representa a navegação editorial e não precisa conter um navPoint
  // para cada XHTML do spine. Preservamos a organização do sumário original.

  const navPoints = findByLocalName(doc, 'navPoint');
  let playOrderChanged = false;

  navPoints.forEach((navPoint, index) => {
    const expected = String(index + 1);
    if (getAttr(navPoint, 'playOrder') !== expected) {
      navPoint.setAttribute('playOrder', expected);
      playOrderChanged = true;
    }
  });

  const titleChanged = normalizeNcxTitle(doc, pkg.metadata.title);
  if (playOrderChanged || titleChanged) {
    files.set(pkg.ncxItem.resolvedPath, TEXT_ENCODER.encode(serializeXmlPreservingDeclaration(doc, ncxSource)));
  }

  if (playOrderChanged) {
    actions.push({
      type: 'normalized',
      title: 'playOrder do NCX normalizado',
      detail: 'Os navPoints do toc.ncx foram renumerados em sequência limpa.',
      file: pkg.ncxItem.resolvedPath,
    });
  }

  if (titleChanged) {
    actions.push({
      type: 'updated',
      title: 'Título do NCX ajustado',
      detail:
        'O título do documento NCX foi alinhado ao título do OPF quando estava vazio ou genérico.',
      file: pkg.ncxItem.resolvedPath,
    });
  }

  return actions;
}

function repairXhtmlCompatibility(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
): RepairAction[] {
  const actions: RepairAction[] = [];
  const rawLanguage = pkg.metadata.language;
  const language = rawLanguage && !isInvalidLanguageTag(rawLanguage)
    ? normalizeLanguageTag(rawLanguage)
    : undefined;

  for (const item of pkg.manifest) {
    if (!item.exists || !HTML_MEDIA_TYPES.has(item.mediaType)) continue;

    const bytes = files.get(item.resolvedPath);
    if (!bytes) continue;

    const original = decodeUtf8ForRewrite(bytes, item.resolvedPath);
    let output = original;
    const fileActions: RepairAction[] = [];

    if (/&nbsp;/iu.test(output)) {
      output = output.replace(/&nbsp;/giu, '&#160;');
      fileActions.push({
        type: 'updated',
        title: 'Entidade &nbsp; normalizada',
        detail:
          'As entidades &nbsp; foram substituídas por &#160; para evitar falhas de parsing XML.',
        file: item.resolvedPath,
      });
    }

    const withLanguage = language ? ensureHtmlLanguage(output, language) : output;
    if (withLanguage !== output) {
      output = withLanguage;
      fileActions.push({
        type: 'updated',
        title: 'Idioma declarado no XHTML',
        detail: `A tag html recebeu lang/xml:lang="${language}" para melhorar compatibilidade e acessibilidade.`,
        file: item.resolvedPath,
      });
    }

    const withContentType = normalizeContentTypeMeta(output);
    if (withContentType !== output) {
      output = withContentType;
      fileActions.push({
        type: 'updated',
        title: 'Meta Content-Type normalizado',
        detail: 'Metadados Content-Type suspeitos foram normalizados para XHTML UTF-8.',
        file: item.resolvedPath,
      });
    }

    if (output !== original) {
      files.set(item.resolvedPath, TEXT_ENCODER.encode(output));
      actions.push(...fileActions);
    }
  }

  return actions;
}

/** Ajusta somente idioma XHTML na operação opcional; não altera NCX ou prosa. */
export function repairOptionalXhtmlLanguage(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
): RepairAction[] {
  const actions: RepairAction[] = [];
  const raw = pkg.metadata.language;
  if (!raw || isInvalidLanguageTag(raw)) return actions;
  const language = normalizeLanguageTag(raw);
  for (const item of pkg.manifest) {
    if (!item.exists || item.mediaType !== 'application/xhtml+xml') continue;
    const bytes = files.get(item.resolvedPath);
    if (!bytes) continue;
    const source = decodeUtf8ForRewrite(bytes, item.resolvedPath);
    const normalized = ensureHtmlLanguage(source, language);
    if (normalized === source) continue;
    files.set(item.resolvedPath, TEXT_ENCODER.encode(normalized));
    actions.push({
      type: 'updated',
      title: 'Idioma XHTML definido na otimização',
      detail: 'lang/xml:lang recebeu idioma já existente no OPF.',
      file: item.resolvedPath,
    });
  }
  return actions;
}

function normalizeNcxTitle(doc: Document, title: string | undefined): boolean {
  const normalizedTitle = title?.trim();
  if (!normalizedTitle) return false;

  const docTitle = findByLocalName(doc, 'docTitle')[0];
  if (!docTitle) return false;

  const textElement = childElementsByLocalName(docTitle, 'text')[0];
  if (!textElement) return false;

  const current = textElement.textContent?.trim() ?? '';
  if (current && !/^(?:untitled|unknown|sem título)$/iu.test(current)) return false;

  textElement.textContent = normalizedTitle;
  return true;
}

function ensureHtmlLanguage(text: string, language: string): string {
  return text.replace(/<html\b([^>]*)>/iu, (_full, attrs: string) => {
    let nextAttrs = attrs;
    nextAttrs = upsertLanguageAttribute(nextAttrs, 'xml:lang', language);
    nextAttrs = upsertLanguageAttribute(nextAttrs, 'lang', language);
    return `<html${nextAttrs.trimEnd()}>`;
  });
}

function upsertLanguageAttribute(attrs: string, name: string, language: string): string {
  const escaped = escapeAttribute(language);
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'iu');
  if (pattern.test(attrs)) {
    return attrs.replace(pattern, (_match, quote: string, value: string) => {
      if (value.trim()) return ` ${name}=${quote}${value}${quote}`;
      return ` ${name}=${quote}${escaped}${quote}`;
    });
  }
  return `${attrs} ${name}="${escaped}"`;
}

function normalizeContentTypeMeta(text: string): string {
  return text.replace(/<meta\b[^>]*http-equiv\s*=\s*(["'])?content-type\1?[^>]*>/giu, (meta) => {
    const content = readAttribute(meta, 'content');
    if (!content) return meta;

    const normalized = content.trim().toLowerCase();
    const valid = /^(?:application\/xhtml\+xml|text\/html)(?:\s*;\s*charset\s*=\s*[-\w]+)?$/iu.test(
      normalized,
    );
    if (valid) return meta;

    return '<meta http-equiv="Content-Type" content="application/xhtml+xml; charset=utf-8" />';
  });
}

function readAttribute(tag: string, name: string): string | undefined {
  const pattern = new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, 'iu');
  return pattern.exec(tag)?.[2]?.trim() || undefined;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;');
}
