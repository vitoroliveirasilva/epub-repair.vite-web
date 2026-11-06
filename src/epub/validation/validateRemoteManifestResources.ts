import type { Issue } from '../model/issueTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { createIssue } from '../utils/issueFactory';

const FONT_TYPES = new Set([
  'application/font-woff', 'application/font-sfnt',
  'application/vnd.ms-opentype', 'application/x-font-ttf',
  'application/x-font-otf', 'application/x-font-woff',
]);
const SCRIPT_TYPES = new Set(['text/javascript', 'application/javascript',
  'application/ecmascript']);

/**
 * Recursos externos de um EPUB são dependências explícitas de conectividade,
 * não arquivos ZIP ausentes nem indícios de malware.
 * Em EPUB 3.3, arquivos de áudio, vídeo, fontes e dados solicitados por APIs
 * de script podem morar remotamente. XHTML/CSS/imagens e SMIL devem ser locais.
 */
export function validateRemoteManifestResources(pkg: PackageDocumentInfo): Issue[] {
  const issues: Issue[] = [];
  const epub3 = pkg.version.trim().startsWith('3');

  for (const item of pkg.manifest) {
    if (!item.remote) continue;
    const mediaType = item.mediaType.toLowerCase().split(';')[0]?.trim() ?? '';
    const allowed = epub3 && (
      mediaType.startsWith('audio/') || mediaType.startsWith('video/') ||
      mediaType.startsWith('font/') || FONT_TYPES.has(mediaType) ||
      SCRIPT_TYPES.has(mediaType) ||
      // Dados para APIs de script não possuem uma única família MIME; tratar
      // formatos desconhecidos como ambíguos, não como ameaça automática.
      !(mediaType.startsWith('image/') || mediaType === 'text/css' ||
        mediaType === 'application/xhtml+xml' || mediaType === 'text/html' ||
        mediaType === 'application/smil+xml' ||
        mediaType === 'application/x-dtbncx+xml')
    );
    if (!allowed) {
      issues.push(createIssue({
        code: 'OPF_REMOTE_RESOURCE_UNSUPPORTED',
        severity: 'warning',
        title: 'Tipo de recurso remoto incompatível com a versão EPUB',
        detail: 'O item "' + item.id + '" está hospedado externamente com media-type="' +
          item.mediaType + '". A publicação exige recurso local ou revisão de ' +
          'compatibilidade; nenhum link ou fonte será removido automaticamente.',
        file: pkg.opfPath,
        context: item.id,
        repairable: false,
      }));
    }
    // HTTP não é executável nem malware. Preferir HTTPS é recomendação W3C.
    if (/^http:\/\//iu.test(item.href)) {
      issues.push(createIssue({
        code: 'OPF_REMOTE_HTTP_TRANSPORT',
        severity: 'info',
        title: 'Recurso externo usa HTTP sem criptografia de transporte',
        detail: 'EPUB recomenda HTTPS para recursos hospedados fora do arquivo. ' +
          'HTTP é mantido para compatibilidade e não equivale a malware.',
        file: pkg.opfPath,
        context: item.id,
        repairable: false,
      }));
    }
  }

  return issues;
}
