import type { LoadedEpub } from '../model/epubTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import type { Issue } from '../model/issueTypes';
import { createIssue } from '../utils/issueFactory';
import { containsDangerousCss, shouldRemoveUrl } from '../sanitize/sanitizeActiveContent';
import { parseXml } from '../utils/xmlUtils';
import { splitSrcsetCandidates } from '../utils/pathUtils';

const ACTIVE_ELEMENT = new Set([
  'script', 'iframe', 'frame', 'frameset', 'object', 'embed',
  'foreignobject', 'applet', 'portal', 'animate', 'animatemotion',
  'animatetransform', 'set',
]);





export function validateUndeclaredActiveContent(
  loaded: LoadedEpub,
  pkg: PackageDocumentInfo,
): Issue[] {
  const declared = new Set(pkg.manifest.map((item) => item.resolvedPath));
  const issues: Issue[] = [];
  for (const [path, entry] of loaded.files) {
    if (declared.has(path)) continue;
    if (!/\.(?:xhtml?|svg|css)$/iu.test(path)) continue;
    let active: boolean;
    try {
      
      const text = new TextDecoder('utf-8', { fatal: true }).decode(entry.bytes);
      if (/\.css$/iu.test(path)) {
        active = containsDangerousCss(text);
      } else {
        const doc = /\.html?$/iu.test(path)
          ? new DOMParser().parseFromString(text, 'text/html')
          : parseXml(text.replace(/&nbsp;/giu, '&#160;'), 'application/xhtml+xml');
        active = Array.from(doc.getElementsByTagName('*')).some((node) => {
          const tag = node.localName.toLowerCase();
          if (ACTIVE_ELEMENT.has(tag)) return true;
          if (tag === 'meta' &&
              node.getAttribute('http-equiv')?.trim().toLowerCase() === 'refresh') return true;
          if (tag === 'style' && containsDangerousCss(node.textContent ?? '')) return true;
          return Array.from(node.attributes).some((attr) => {
            const name = attr.name.toLowerCase();
            const localName = attr.localName.toLowerCase();
            if (name.startsWith('on') || localName === 'srcdoc') return true;
            if (localName === 'style' && containsDangerousCss(attr.value)) return true;
            if (localName === 'srcset') {
              return splitSrcsetCandidates(attr.value).some((candidate) =>
                shouldRemoveUrl(candidate.trim().split(/\s+/u)[0] ?? '', {
                  sanitizeScripts: true, removeRemoteResourceLinks: false,
                }, localName));
            }
            return ['href', 'src', 'data', 'poster', 'background', 'action',
              'formaction', 'cite', 'longdesc'].includes(localName) &&
              shouldRemoveUrl(attr.value, {
                sanitizeScripts: true, removeRemoteResourceLinks: false,
              }, localName);
          });
        });
      }
    } catch {
      
      active = true;
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
