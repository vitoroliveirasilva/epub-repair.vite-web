import type { RepairAction } from '../model/repairTypes';
import { sanitizeActiveContentMarkup } from './sanitizeActiveContent';
import {
  basename,
  isRemoteUrl,
  isSafeRemoteResourceUrl,
  isSafeInlineImageDataUrl,
  splitSrcsetCandidates,
  resolveReference,
} from '../utils/pathUtils';

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
  replaceMissingImagesWithText?: boolean;
}

export function sanitizeHtmlDocument(
  text: string,
  options: SanitizeHtmlOptions,
): SanitizeHtmlResult {
  const actions: RepairAction[] = [];
  let output = text;

  if (options.sanitizeScripts) {
    const before = output;
    output = outsideHtmlComments(output, (part) => part
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/giu, '')
      .replace(/<script\b[^>]*\/?>/giu, '')
      .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/giu, '')
      .replace(/\s+(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/giu, ''));
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
    output = outsideHtmlComments(output, (part) => part
      .replace(/<(iframe|embed|object)\b[^>]*>[\s\S]*?<\/\1\s*>/giu,
        '<p>[Recurso interativo removido]</p>')
      .replace(/<(iframe|embed|object)\b[^>]*\/?>/giu,
        '<p>[Recurso interativo removido]</p>'));
    if (output !== before) {
      actions.push({
        type: 'updated',
        title: 'Recursos interativos neutralizados',
        detail: 'iframe, embed e object foram substituídos por marcador textual seguro.',
        file: options.filePath,
      });
    }
  }

  if (options.replaceMissingImagesWithText) {
    output = outsideHtmlComments(output, (part) => replaceMissingImages(part, options, actions));
  }
  output = outsideHtmlComments(output, (part) => replaceBrokenKindleEmbeds(part, options.filePath, actions));

  if (options.removeRemoteResourceLinks) {
    output = outsideHtmlComments(output, (part) => replaceRemoteAnchors(part, options.filePath, actions));
    output = outsideHtmlComments(output, (part) => removeRemoteResourceAttributes(part, options.filePath, actions));
  }

  output = outsideHtmlComments(output, (part) => filterUnsafeSrcset(part, options, actions));
  output = outsideHtmlComments(output, (part) => removeBrokenResourceAttributes(part, options, actions));

  // O parser interpreta entidades e namespaces antes de validar atributos,
  // cobrindo variações que expressões regulares não conseguem reconhecer.
  const structurallySanitized = sanitizeActiveContentMarkup(output, options.filePath, options);
  if (structurallySanitized.changed) {
    output = structurallySanitized.text;
    actions.push({
      type: 'updated',
      title: 'Conteúdo ativo e URLs inseguras neutralizados',
      detail: 'Elementos e atributos perigosos foram removidos por análise estrutural do documento.',
      file: options.filePath,
    });
  }

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
  let output = text.replace(
    /<img\b[^>]*\bsrc\s*=\s*(["'])(kindle:embed:[^"']+)\1[^>]*>/giu,
    (_full, _quote: string, value: string) => {
      changed = true;
      return `<span class="epub-repair-kindle-embed">[Conteúdo Kindle indisponível: ${escapeHtml(value)}]</span>`;
    },
  );
  output = output.replace(
    /<a\b([^>]*)\bhref\s*=\s*(["'])(kindle:embed:[^"']+)\2([^>]*)>([\s\S]*?)<\/a\s*>/giu,
    (_full, _before: string, _quote: string, value: string, _after: string, label: string) => {
      changed = true;
      return escapeHtml(stripTags(label).trim() || value);
    },
  );
  output = output.replace(
    /<(iframe|embed|object|source)\b[^>]*(?:src|data)\s*=\s*(["'])kindle:embed:[^"']+\2[^>]*>(?:[\s\S]*?<\/\1\s*>)?/giu,
    () => {
      changed = true;
      return '<p>[Conteúdo Kindle indisponível]</p>';
    },
  );
  // Referências Kindle são neutralizadas somente quando aparecem em atributos
  // ou elementos reais. Texto literal de livros técnicos deve permanecer intacto.

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

function filterUnsafeSrcset(
  text: string,
  options: SanitizeHtmlOptions,
  actions: RepairAction[],
): string {
  let changed = false;
  const output = text.replace(
    /\ssrcset\s*=\s*(["'])(.*?)\1/giu,
    (full, quote: string, value: string) => {
      const candidates = splitSrcsetCandidates(value);
      const safeCandidates = candidates
        .filter(Boolean)
        .filter((candidate) => {
          const [rawUrl] = candidate.split(/\s+/u);
          if (!rawUrl || rawUrl.startsWith('#') || rawUrl.startsWith('kindle:embed:')) return false;
          if (isSafeInlineImageDataUrl(rawUrl)) return true;
          if (isRemoteUrl(rawUrl)) {
            return isSafeRemoteResourceUrl(rawUrl) && !options.removeRemoteResourceLinks;
          }
          const resolved = resolveReference(options.filePath, rawUrl);
          return resolved.safe && options.existingFiles.has(resolved.path);
        });

      if (safeCandidates.length === candidates.length) {
        return full;
      }

      changed = true;
      return safeCandidates.length ? ` srcset=${quote}${safeCandidates.join(', ')}${quote}` : '';
    },
  );

  if (changed) {
    actions.push({
      type: 'updated',
      title: 'Srcset inseguro filtrado',
      detail: 'Candidatos srcset remotos, kindle:embed ou inexistentes foram removidos.',
      file: options.filePath,
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
      // Preservar tags editoriais e entidades ao remover apenas o link.
      const titleMatch = `${before} ${after}`.match(/\btitle\s*=\s*(["'])(.*?)\1/iu);
      const title = titleMatch?.[2]?.trim();
      return label.trim() ? label : escapeHtml(title || href);
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
  const output = text.replace(/<[^>]+>/giu, (tag) =>
    tag.replace(
      /\s(?:src|poster|data|xlink:href)\s*=\s*(["'])(.*?)\1/giu,
      (full, _quote: string, value: string) => {
        // O marcador altera o conteúdo editorial e exige opt-in. Sem ele, manter o img.
        if (!options.replaceMissingImagesWithText &&
            /^<img\b/iu.test(tag) && /^\s+src\s*=/iu.test(full)) return full;
        const raw = value.trim();
        if (!raw || raw.startsWith('#') || isRemoteUrl(raw) || raw.startsWith('kindle:embed:'))
          return full;
        const resolved = resolveReference(options.filePath, raw);
        if (resolved.safe && options.existingFiles.has(resolved.path)) return full;
        changed = true;
        return '';
      },
    ),
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

/** Preserva comentários editoriais que exibem exemplos literais de tags. */
function outsideHtmlComments(source: string, transform: (part: string) => string): string {
  return source.split(/(<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>)/gu).map((part) =>
    (part.startsWith('<!--') && part.endsWith('-->')) ||
    (part.startsWith('<![CDATA[') && part.endsWith(']]>'))
      ? part : transform(part)).join('');
}
