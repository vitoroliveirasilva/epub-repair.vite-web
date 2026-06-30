import type { RepairAction } from '../model/repairTypes';
import { basename, isRemoteUrl, resolveReference } from '../utils/pathUtils';

export interface SanitizeHtmlResult {
  text: string;
  changed: boolean;
  actions: RepairAction[];
}

export interface SanitizeHtmlOptions {
  filePath: string;
  existingFiles: Set<string>;
  sanitizeScripts: boolean;
  removeRemoteResourceLinks: boolean;
  kindleSafeMode: boolean;
}

export function sanitizeHtmlDocument(
  text: string,
  options: SanitizeHtmlOptions,
): SanitizeHtmlResult {
  const actions: RepairAction[] = [];
  let output = text;

  if (options.sanitizeScripts) {
    const before = output;
    output = output.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/giu, '');
    output = output.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/giu, '');
    output = output.replace(/\s+(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/giu, '');
    if (output !== before) {
      actions.push({
        type: 'updated',
        title: 'Scripts e handlers inline removidos',
        detail: 'Foram removidos scripts, javascript: e atributos on* para leitura segura.',
        file: options.filePath,
      });
    }
  }

  if (options.kindleSafeMode) {
    const before = output;
    output = output.replace(
      /<(iframe|embed|object)\b[^>]*>[\s\S]*?<\/\1\s*>/giu,
      '<p>[Recurso interativo removido]</p>',
    );
    output = output.replace(
      /<(iframe|embed|object)\b[^>]*\/?>/giu,
      '<p>[Recurso interativo removido]</p>',
    );
    if (output !== before) {
      actions.push({
        type: 'updated',
        title: 'Recursos interativos neutralizados',
        detail: 'iframe, embed e object foram substituídos por marcador textual seguro.',
        file: options.filePath,
      });
    }
  }

  output = replaceMissingImages(output, options, actions);
  output = replaceBrokenKindleEmbeds(output, options.filePath, actions);

  if (options.removeRemoteResourceLinks) {
    output = replaceRemoteAnchors(output, options.filePath, actions);
    output = removeRemoteResourceAttributes(output, options.filePath, actions);
  }

  output = removeBrokenResourceAttributes(output, options, actions);

  return { text: output, changed: output !== text, actions };
}

function replaceMissingImages(
  text: string,
  options: SanitizeHtmlOptions,
  actions: RepairAction[],
): string {
  let changed = false;
  const output = text.replace(
    /<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/giu,
    (full, _quote: string, rawSrc: string) => {
      const src = rawSrc.trim();
      if (!src || src.startsWith('#') || isRemoteUrl(src)) return full;
      const resolved = resolveReference(options.filePath, src);
      if (resolved.safe && options.existingFiles.has(resolved.path)) return full;
      changed = true;
      const label = basename(src) || src || 'imagem';
      return `<span class="epub-repair-missing-image">[Imagem indisponível: ${escapeHtml(label)}]</span>`;
    },
  );

  if (changed) {
    actions.push({
      type: 'updated',
      title: 'Imagens ausentes viraram marcador visível',
      detail: 'Tags img com arquivo inexistente foram substituídas por texto visível no livro.',
      file: options.filePath,
    });
  }

  return output;
}

function replaceBrokenKindleEmbeds(
  text: string,
  filePath: string,
  actions: RepairAction[],
): string {
  let changed = false;
  const output = text.replace(/kindle:embed:[^\s"'<>)]*/giu, (value) => {
    changed = true;
    return `[Conteúdo Kindle indisponível: ${escapeHtml(value)}]`;
  });

  if (changed) {
    actions.push({
      type: 'updated',
      title: 'Referências kindle:embed neutralizadas',
      detail: 'Referências proprietárias quebráveis foram trocadas por marcador textual seguro.',
      file: filePath,
    });
  }

  return output;
}

function replaceRemoteAnchors(text: string, filePath: string, actions: RepairAction[]): string {
  let changed = false;
  const output = text.replace(
    /<a\b([^>]*)\bhref\s*=\s*(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/a\s*>/giu,
    (full, before: string, _quote: string, href: string, after: string, label: string) => {
      if (!isRemoteUrl(href)) return full;
      changed = true;
      const readable = stripTags(label).trim() || href;
      const titleMatch = `${before} ${after}`.match(/\btitle\s*=\s*(["'])(.*?)\1/iu);
      const title = titleMatch?.[2]?.trim();
      return escapeHtml(title || readable);
    },
  );

  if (changed) {
    actions.push({
      type: 'updated',
      title: 'Links externos convertidos em texto',
      detail: 'Links remotos foram transformados em texto legível para leitura offline.',
      file: filePath,
    });
  }

  return output;
}

function removeRemoteResourceAttributes(
  text: string,
  filePath: string,
  actions: RepairAction[],
): string {
  let changed = false;
  const output = text.replace(
    /\s(?:src|poster|data|xlink:href)\s*=\s*(["'])(.*?)\1/giu,
    (full, _quote: string, value: string) => {
      if (!isRemoteUrl(value)) return full;
      changed = true;
      return '';
    },
  );

  if (changed) {
    actions.push({
      type: 'updated',
      title: 'Recursos remotos removidos do conteúdo',
      detail: 'Atributos de mídia apontando para URLs externas foram removidos.',
      file: filePath,
    });
  }

  return output;
}

function removeBrokenResourceAttributes(
  text: string,
  options: SanitizeHtmlOptions,
  actions: RepairAction[],
): string {
  let changed = false;
  const output = text.replace(
    /\s(?:src|poster|data|xlink:href)\s*=\s*(["'])(.*?)\1/giu,
    (full, _quote: string, value: string) => {
      const raw = value.trim();
      if (!raw || raw.startsWith('#') || isRemoteUrl(raw) || raw.startsWith('kindle:embed:'))
        return full;
      const resolved = resolveReference(options.filePath, raw);
      if (resolved.safe && options.existingFiles.has(resolved.path)) return full;
      changed = true;
      return '';
    },
  );

  if (changed) {
    actions.push({
      type: 'updated',
      title: 'Referências quebradas removidas de atributos',
      detail:
        'Atributos apontando para arquivos inexistentes foram removidos quando não era imagem substituível por marcador.',
      file: options.filePath,
    });
  }

  return output;
}

function stripTags(text: string): string {
  return text.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
