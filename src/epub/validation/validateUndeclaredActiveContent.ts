import type { LoadedEpub } from '../model/epubTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import type { Issue } from '../model/issueTypes';
import { createIssue } from '../utils/issueFactory';
import { containsDangerousCss, shouldRemoveUrl } from '../sanitize/sanitizeActiveContent';
import { parseXml } from '../utils/xmlUtils';

const ACTIVE_ELEMENT = new Set([
  'script', 'iframe', 'frame', 'frameset', 'object', 'embed',
  'foreignobject', 'applet', 'portal', 'animate', 'animatemotion',
  'animatetransform', 'set',
]);

/**
 * Mesmo XHTML/SVG/CSS fora do manifest permanece no ZIP. Inventariar
 * conteúdo ativo órfão sem executar/neutralizar cegamente e exigir revisão.
 */
export function validateUndeclaredActiveContent(
  loaded: LoadedEpub,
  pkg: PackageDocumentInfo,
): Issue[] {
  const declared = new Set(pkg.manifest.map((item) => item.resolvedPath));
  const issues: Issue[] = [];
  for (const [path, entry] of loaded.files) {
    if (declared.has(path)) continue;
    if (!/\.(?:xhtml?|svg|css)$/iu.test(path)) continue;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(entry.bytes);
    let active: boolean;
    if (/\.css$/iu.test(path)) {
      active = containsDangerousCss(text.replace(/\/\*[\s\S]*?\*\//gu, ''));
    } else {
      try {
        const doc = /\.html?$/iu.test(path)
          ? new DOMParser().parseFromString(text, 'text/html')
          : parseXml(text.replace(/&nbsp;/giu, '&#160;'), 'application/xhtml+xml');
        active = Array.from(doc.getElementsByTagName('*')).some((node) =>
          ACTIVE_ELEMENT.has(node.localName.toLowerCase()) ||
          Array.from(node.attributes).some((attr) =>
            attr.name.toLowerCase().startsWith('on') ||
            (attr.localName === 'style' && containsDangerousCss(attr.value)) ||
            (['href', 'src', 'data', 'poster', 'xlink:href'].includes(attr.name.toLowerCase()) &&
              shouldRemoveUrl(attr.value, {
                sanitizeScripts: true, removeRemoteResourceLinks: false,
              }, attr.localName)),
          ),
        );
      } catch {
        // Se XML órfão não pode ser interpretado, não declarar ausência de risco.
        active = true;
      }
    }
    if (active) {
      issues.push(createIssue({
        code: 'PACKAGE_UNDECLARED_ACTIVE_CONTENT',
        severity: 'warning',
        title: 'Conteúdo ativo fora do manifest',
        detail: 'Um XHTML/SVG/CSS não declarado contém sinais ativos ou não pode ser ' +
          'interpretado com confiança. Foi preservado sem execução nem inclusão automática ' +
          'no manifest e exige revisão manual.',
        file: path,
        repairable: false,
      }));
    }
  }
  return issues;
}
