import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { HTML_MEDIA_TYPES } from '../utils/constants';
import { createIssue } from '../utils/issueFactory';
import {
  isInternalAnchor,
  isRemoteUrl,
  isSafeExternalLinkUrl,
  isSafeInlineImageDataUrl,
  splitSrcsetCandidates,
  resolveReference,
} from '../utils/pathUtils';
import { parseXml } from '../utils/xmlUtils';
import { containsDangerousCss, shouldRemoveUrl } from '../sanitize/sanitizeActiveContent';
import { extractDocumentResourceReferences } from './referenceExtractor';

export function validateContentReferences(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  const issues: Issue[] = [];
  const candidates = pkg.manifest.filter(
    (item) => item.exists && (HTML_MEDIA_TYPES.has(item.mediaType) || item.mediaType === 'image/svg+xml'),
  );

  for (const item of candidates) {
    const file = loaded.files.get(item.resolvedPath);
    if (!file) continue;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(file.bytes);
    let contentDoc: Document | undefined;

    if (item.mediaType === 'application/xhtml+xml' || item.mediaType === 'image/svg+xml') {
      try {
        parseXml(text, 'application/xhtml+xml');
      } catch (error) {
        issues.push(
          createIssue({
            code: 'CONTENT_INVALID_XML',
            severity: 'warning',
            title: 'XHTML com XML inválido',
            detail:
              error instanceof Error
                ? error.message
                : 'O conteúdo não pôde ser lido como XHTML válido.',
            file: item.resolvedPath,
            repairable: false,
          }),
        );
      }
    }

    if (/(?:<style\b|\sstyle\s*=)/iu.test(text)) {
      try {
        const doc = item.mediaType === 'text/html'
          ? new DOMParser().parseFromString(text, 'text/html')
          : parseXml(text.replace(/&nbsp;/giu, '&#160;'), 'application/xhtml+xml');
        const dangerous = Array.from(doc.getElementsByTagName('*')).some((element) =>
          (element.localName.toLowerCase() === 'style' &&
            containsDangerousCss(element.textContent ?? '')) ||
          (element.hasAttribute('style') &&
            containsDangerousCss(element.getAttribute('style') ?? '')),
        );
        if (dangerous) {
          issues.push(createIssue({
            code: 'CONTENT_UNSAFE_STYLE',
            severity: 'warning',
            title: 'CSS embutido contém expressão ou URL perigosa',
            detail: 'Uma declaração CSS ativa precisa ser neutralizada sem remover estilos seguros.',
            file: item.resolvedPath,
            repairable: true,
          }));
        }
      } catch {
        // XHTML/XML inválido é registrado separadamente.
      }
    }

    // Complementa o scanner textual: entidades HTML são decodificadas pelo parser.
    // Sem essa camada, java&#115;cript: pode ser confundido com um nome local.
    try {
      const doc = item.mediaType === 'text/html'
        ? new DOMParser().parseFromString(text, 'text/html')
        : parseXml(text.replace(/&nbsp;/giu, '&#160;'), 'application/xhtml+xml');
      contentDoc = doc;
      let unsafeUrl = false;
      let activeHandler = false;
      let unsafeEmbed = false;
      const embedded = new Set(['iframe', 'frame', 'frameset', 'embed', 'object',
        'foreignobject', 'applet', 'portal']);
      const scripted = new Set(['script', 'animate', 'animatemotion', 'animatetransform', 'set']);
      for (const element of Array.from(doc.getElementsByTagName('*'))) {
        const name = element.localName.toLowerCase();
        if (embedded.has(name)) unsafeEmbed = true;
        if (scripted.has(name) || (name === 'meta' &&
          (element.getAttribute('http-equiv') ?? '').trim().toLowerCase() === 'refresh')) {
          activeHandler = true;
        }
        for (const attr of Array.from(element.attributes)) {
          const attrName = attr.localName.toLowerCase();
          if (attrName.startsWith('on') || attrName === 'srcdoc') activeHandler = true;
          if (attrName === 'srcset') {
            for (const candidate of splitSrcsetCandidates(attr.value)) {
              const url = candidate.trim().split(/\s+/u)[0] ?? '';
              if (shouldRemoveUrl(url,
                { sanitizeScripts: true, removeRemoteResourceLinks: false }, attrName)) {
                unsafeUrl = true;
              }
            }
          } else if (['href', 'src', 'poster', 'data', 'background', 'action',
            'formaction', 'cite', 'longdesc'].includes(attrName) &&
            shouldRemoveUrl(attr.value,
              { sanitizeScripts: true, removeRemoteResourceLinks: false }, attrName)) {
            unsafeUrl = true;
          }
        }
      }
      if (unsafeUrl) {
        issues.push(createIssue({
          code: 'CONTENT_UNSAFE_URL',
          severity: 'warning',
          title: 'URL executável detectada após decodificar entidades',
          detail: 'Uma URL usa um esquema inseguro que precisa ser neutralizado.',
          file: item.resolvedPath,
          repairable: true,
        }));
      }
      if (unsafeEmbed) {
        issues.push(createIssue({
          code: 'CONTENT_UNSAFE_EMBED',
          severity: 'warning',
          title: 'Elemento interativo reconhecido estruturalmente',
          detail: 'iframe, frame, object, embed ou elemento equivalente exige revisão.',
          file: item.resolvedPath,
          repairable: true,
        }));
      }
      if (activeHandler) {
        issues.push(createIssue({
          code: 'CONTENT_SCRIPTED',
          severity: 'warning',
          title: 'Conteúdo ativo reconhecido pela estrutura do documento',
          detail: 'Script, animação ativa, evento inline ou redirecionamento HTML precisa de revisão.',
          file: item.resolvedPath,
          repairable: true,
        }));
      }
    } catch {
      // XHTML inválido já é diagnosticado como CONTENT_INVALID_XML.
    }

    for (const ref of contentDoc ? extractDocumentResourceReferences(contentDoc) : []) {
      if (!ref.value || isInternalAnchor(ref.raw)) continue;

      if (ref.value.startsWith('kindle:embed:')) {
        issues.push(
          createIssue({
            code: 'CONTENT_KINDLE_EMBED_BROKEN',
            severity: 'warning',
            title: 'Referência kindle:embed encontrada',
            detail:
              'Referências proprietárias kindle:embed podem quebrar fora do ambiente original e serão neutralizadas no reparo seguro.',
            file: item.resolvedPath,
            context: ref.raw,
            repairable: true,
          }),
        );
        continue;
      }

      if (isRemoteUrl(ref.value)) {
        if (isSafeExternalLinkUrl(ref.value) ||
          (['src', 'srcset', 'poster'].includes(ref.attr) &&
            isSafeInlineImageDataUrl(ref.value))) continue;
        issues.push(
          createIssue({
            code: 'CONTENT_UNSAFE_URL',
            severity: 'warning',
            title: 'Conteúdo contém URL potencialmente perigosa',
            detail: `A referência "${ref.raw}" usa um esquema não permitido para conteúdos EPUB.`,
            file: item.resolvedPath,
            context: ref.attr,
            repairable: true,
          }),
        );
        continue;
      }

      const resolved = resolveReference(item.resolvedPath, ref.value);
      if (!resolved.path) continue;
      if (!resolved.safe || !loaded.files.has(resolved.path)) {
        issues.push(
          createIssue({
            code: 'CONTENT_MISSING_RESOURCE',
            severity: 'warning',
            title: 'Recurso referenciado no conteúdo não existe',
            detail: `A referência "${ref.raw}" aponta para "${resolved.path}", mas esse arquivo não foi encontrado no EPUB.`,
            file: item.resolvedPath,
            context: ref.attr,
            // Links editoriais href exigem destino real e jamais são reconstruídos por inferência.
            repairable: ref.attr !== 'href',
          }),
        );
      }
    }
  }

  return issues;
}
