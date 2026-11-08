import type { LoadedEpub } from '../model/epubTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import type { Issue, IssueCode } from '../model/issueTypes';
import { createIssue } from '../utils/issueFactory';
import { resolveFromDir, resolveReference } from '../utils/pathUtils';
import { parseXml } from '../utils/xmlUtils';

/**
 * Capa: a imagem no manifest e a página de rosto no guide/landmarks
 * podem ser arquivos distintos. Não supor que precisam ter o mesmo caminho.
 */
export function validateCoverConsistency(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  const issues: Issue[] = [];
  const raw = loaded.files.get(pkg.opfPath)?.bytes;
  if (!raw) return [];
  const notify = (code: IssueCode, file: string, detail: string) => issues.push(createIssue({
    code, severity: 'warning', title: 'Referência de capa precisa de revisão',
    detail, file, repairable: false,
  }));
  let doc: Document;
  try {
    doc = parseXml(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  } catch {
    return []; // OPF inválido já reportado pelo parser.
  }
  const nodes = Array.from(doc.getElementsByTagName('*'));
  const metaCover = nodes.find((el) => el.localName === 'meta' && el.getAttribute('name') === 'cover');
  const legacy = metaCover?.getAttribute('content')?.trim();
  const byId = new Map(pkg.manifest.map((item) => [item.id, item]));
  const metaItem = legacy ? byId.get(legacy) : undefined;
  const declaredImages = pkg.manifest.filter((item) => item.properties.includes('cover-image'));
  const isCoverImage = (mediaType: string): boolean => /^image\/(?:jpe?g|png)$/iu.test(mediaType);
  if (metaItem && !isCoverImage(metaItem.mediaType)) {
    notify('COVER_DECLARATIONS_CONFLICT', pkg.opfPath,
      'meta name="cover" aponta para item que não é imagem JPEG/PNG de capa. ' +
      'A página XHTML de rosto não substitui a declaração da imagem oficial.');
  }
  for (const item of declaredImages) {
    if (!isCoverImage(item.mediaType)) {
      notify('COVER_DECLARATIONS_CONFLICT', pkg.opfPath,
        'properties="cover-image" está associado a um recurso que não é imagem JPEG/PNG: ' +
        item.resolvedPath);
    }
  }

  if (metaItem && declaredImages.length === 1 &&
      metaItem.resolvedPath !== declaredImages[0]?.resolvedPath) {
    notify('COVER_DECLARATIONS_CONFLICT', pkg.opfPath,
      'meta name="cover" e properties="cover-image" apontam para arquivos diferentes; ' +
      'selecione manualmente qual é a capa oficial.');
  }
  const guides = nodes.filter((node) =>
    node.localName === 'reference' &&
    (node.parentElement?.localName === 'guide') &&
    (node.getAttribute('type') ?? '').toLowerCase().split(/\s+/u).includes('cover'));
  if (guides.length > 1) {
    notify('COVER_DECLARATIONS_CONFLICT', pkg.opfPath,
      'O guide declara mais de uma referência de capa.');
  }
  for (const guide of guides) {
    const href = guide.getAttribute('href')?.trim() ?? '';
    const target = href ? resolveFromDir(pkg.opfDir, href) : undefined;
    if (!target?.safe || !loaded.files.has(target.path)) {
      notify('COVER_GUIDE_INVALID_TARGET', pkg.opfPath,
        'O guide type="cover" aponta para um documento ausente ou caminho inválido.');
    }
  }

  if (pkg.navItem?.exists) {
    const navRaw = loaded.files.get(pkg.navItem.resolvedPath)?.bytes;
    if (navRaw) {
      try {
        const navDoc = parseXml(new TextDecoder('utf-8', { fatal: true }).decode(navRaw));
        const anchors = Array.from(navDoc.getElementsByTagName('*')).filter((node) =>
          node.localName === 'a' &&
          /(?:^|\s)cover(?:$|\s)/u.test(
            node.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ??
            node.getAttribute('epub:type') ?? '',
          ));
        for (const anchor of anchors) {
          const href = anchor.getAttribute('href')?.trim() ?? '';
          const target = href ? resolveReference(pkg.navItem.resolvedPath, href) : undefined;
          if (!target?.safe || !loaded.files.has(target.path)) {
            notify('COVER_LANDMARK_INVALID_TARGET', pkg.navItem.resolvedPath,
              'O landmark de capa aponta para recurso inexistente ou inseguro.');
          }
        }
      } catch {
        // A análise do próprio documento de navegação reporta XML inválido.
      }
    }
  }
  return issues;
}
