import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { createIssue } from '../utils/issueFactory';
import { isSafeRemoteResourceUrl } from '../utils/pathUtils';
import { extractCssResourceReferences } from './referenceExtractor';
import { parseXml } from '../utils/xmlUtils';

const XHTML = 'http://www.w3.org/1999/xhtml';
const SVG = 'http://www.w3.org/2000/svg';
const MATHML = 'http://www.w3.org/1998/Math/MathML';
const EPUB = 'http://www.idpf.org/2007/ops';

type ContentProperty = 'scripted' | 'mathml' | 'svg' | 'switch' | 'remote-resources';
const PROPERTY_TITLES: Record<ContentProperty, string> = {
  scripted: 'conteúdo com script ou formulário',
  mathml: 'marcação MathML incorporada',
  svg: 'SVG incorporado diretamente',
  switch: 'elemento epub:switch',
  'remote-resources': 'recurso remoto incorporado ou importado',
};

function cssHasRemoteResources(style: string): boolean {
  // Comentários CSS não criam referências e não devem gerar falsos positivos.
  const withoutComments = style.replace(/\/\*[\s\S]*?\*\//gu, '');
  return extractCssResourceReferences(withoutComments).some((ref) =>
    isSafeRemoteResourceUrl(ref.value),
  );
}

function isEmbeddedRemoteReference(node: Element): boolean {
  const name = node.localName.toLowerCase();
  const namespace = node.namespaceURI;
  // Um hyperlink a href de usuário NÃO é recurso remoto da publicação.
  // Também não são recursos: action de formulário, cite e metadados.
  const resourceAttrs = new Set(['src', 'srcset', 'poster', 'data']);
  if (namespace === SVG && ['image', 'use', 'feimage'].includes(name)) {
    resourceAttrs.add('href');
  }
  if (namespace === XHTML && name === 'link' &&
      /^(?:stylesheet|icon|preload|prefetch|modulepreload)$/iu.test(
        node.getAttribute('rel')?.trim() ?? '')) {
    resourceAttrs.add('href');
  }
  for (const attribute of Array.from(node.attributes)) {
    const key = attribute.localName.toLowerCase();
    if (!resourceAttrs.has(key)) continue;
    if (key === 'data' && name !== 'object') continue;
    if (key === 'srcset') {
      // As URLs data:image têm vírgula interna. Para detectar HTTPS, não é
      // necessário dividir o srcset: uma URL https:// é uma entrada distinta.
      if (/(?:^|,\s*)https?:\/\/|(?:^|,\s*)\/\//iu.test(attribute.value)) return true;
      continue;
    }
    if (isSafeRemoteResourceUrl(attribute.value)) return true;
  }
  return false;
}

function isScriptElement(node: Element): boolean {
  if (node.localName.toLowerCase() !== 'script') return false;
  const type = node.getAttribute('type')?.trim().toLowerCase() ?? '';
  // HTML script com MIME de dados não executa JavaScript.
  return !type || type === 'module' ||
    /^(?:text|application)\/(?:java|ecma)script(?:;|$)/u.test(type);
}

/** Inferência compartilhada entre diagnóstico e correção de metadados, sem rede. */
export function inferRequiredManifestProperties(
  mediaType: string,
  bytes: Uint8Array,
): ContentProperty[] {
    const media = mediaType.toLowerCase();
    const isXhtml = media === 'application/xhtml+xml';
    const isSvg = media === 'image/svg+xml';
    const isCss = media === 'text/css';
    const isSmil = media === 'application/smil+xml';
    if (!isXhtml && !isSvg && !isSmil && !isCss) return [];

    const required = new Set<ContentProperty>();
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (isCss) {
      if (cssHasRemoteResources(text)) required.add('remote-resources');
    } else {
      let doc: Document;
      try {
        doc = parseXml(text.replace(/&nbsp;/giu, '&#160;'));
      } catch {
        return []; // XML inválido já tem diagnóstico próprio.
      }
      for (const node of Array.from(doc.getElementsByTagName('*'))) {
        if (isXhtml || isSvg) {
          if (isScriptElement(node) || node.localName.toLowerCase() === 'form' ||
              Array.from(node.attributes).some((attr) =>
                attr.name.toLowerCase().startsWith('on'))) {
            required.add('scripted');
          }
          if (node.namespaceURI === MATHML && node.localName === 'math') {
            required.add('mathml');
          }
          if (isXhtml && node.namespaceURI === SVG && node.localName === 'svg') {
            required.add('svg'); // Um documento SVG isolado já implica SVG.
          }
          if (node.namespaceURI === EPUB && node.localName === 'switch') {
            required.add('switch');
          }
        }
        if (isEmbeddedRemoteReference(node)) required.add('remote-resources');
        if (node.localName.toLowerCase() === 'style' ||
            node.hasAttribute('style')) {
          if (cssHasRemoteResources((node.textContent && node.localName.toLowerCase() === 'style')
            ? node.textContent : (node.getAttribute('style') ?? ''))) {
            required.add('remote-resources');
          }
        }
      }
    }
  return Array.from(required);
}

/** Inspeção estrutural não executa scripts nem acessa referências de rede. */
export function validateManifestContentProperties(
  loaded: LoadedEpub,
  pkg: PackageDocumentInfo,
): Issue[] {
  if (!pkg.version.trim().startsWith('3')) return [];
  const issues: Issue[] = [];
  for (const item of pkg.manifest) {
    if (!item.exists || item.remote) continue;
    const bytes = loaded.files.get(item.resolvedPath)?.bytes;
    if (!bytes) continue;
    const required = inferRequiredManifestProperties(item.mediaType, bytes);
    for (const property of required) {
      if (item.properties.includes(property)) continue;
      issues.push(createIssue({
        code: 'OPF_MANIFEST_PROPERTY_MISSING',
        severity: 'warning',
        title: 'Propriedade obrigatória ausente no manifest',
        detail: 'O item "' + item.id + '" contém ' + PROPERTY_TITLES[property] +
          ' e deve declarar properties="' + property +
          '". Esta é uma inconsistência de metadados, não evidência de malware.',
        file: item.resolvedPath,
        context: property,
        repairable: true,
      }));
    }
  }
  return issues;
}
