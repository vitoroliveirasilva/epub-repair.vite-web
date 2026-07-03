import type { PackageDocumentInfo } from '../model/opfTypes';
import type { RepairAction } from '../model/repairTypes';
import { HTML_MEDIA_TYPES } from '../utils/constants';
import { normalizeLanguageTag } from '../utils/kindleCompatibility';
import {
  childElementsByLocalName,
  findByLocalName,
  getAttr,
  parseXml,
  serializeXml,
} from '../utils/xmlUtils';

const TEXT_DECODER = new TextDecoder('utf-8', { fatal: false });
const TEXT_ENCODER = new TextEncoder();

export function repairKindleCompatibility(
  files: Map<string, Uint8Array>,
  pkg: PackageDocumentInfo,
): RepairAction[] {
  return [...repairNcxCompatibility(files, pkg), ...repairXhtmlCompatibility(files, pkg)];
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
  try {
    doc = parseXml(TEXT_DECODER.decode(bytes));
  } catch {
    return actions;
  }

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
    files.set(pkg.ncxItem.resolvedPath, TEXT_ENCODER.encode(serializeXml(doc)));
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
  const language = normalizeLanguageTag(pkg.metadata.language, 'pt-BR');

  for (const item of pkg.manifest) {
    if (!item.exists || !HTML_MEDIA_TYPES.has(item.mediaType)) continue;

    const bytes = files.get(item.resolvedPath);
    if (!bytes) continue;

    const original = TEXT_DECODER.decode(bytes);
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

    const withLanguage = ensureHtmlLanguage(output, language);
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
  return text.replace(/<html\b([^>]*)>/iu, (full, attrs: string) => {
    if (/\s(?:xml:lang|lang)\s*=/iu.test(attrs)) return full;
    const trimmedAttrs = attrs.trimEnd();
    return `<html${trimmedAttrs} xml:lang="${escapeAttribute(language)}" lang="${escapeAttribute(language)}">`;
  });
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
