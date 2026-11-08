import type { LoadedEpub } from '../model/epubTypes';
import type { Issue, IssueCode } from '../model/issueTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { createIssue } from '../utils/issueFactory';
import { isRemoteUrl, isSafeRemoteResourceUrl, resolveReference } from '../utils/pathUtils';
import { parseXml } from '../utils/xmlUtils';
import { parseSmilClock } from '../utils/smilClock';

const SMIL_NAMESPACE = /^https?:\/\/www\.w3\.org\/ns\/SMIL$/u;

/**
 * Validação não destrutiva de EPUB Media Overlays (SMIL).
 * O motor não converte áudio nem infere novos pontos de sincronização.
 */
export function validateMediaOverlays(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map(pkg.manifest.map((item) => [item.id, item]));
  const overlays = pkg.manifest.filter((item) => item.mediaType === 'application/smil+xml');
  if (overlays.length && pkg.version.startsWith('3')) {
    issues.push(...validateOverlayDurations(loaded, pkg, overlays));
  }
  const notify = (code: IssueCode, file: string, title: string, detail: string, context?: string) => {
    issues.push(createIssue({
      code, file, title, detail, severity: 'warning', repairable: false,
      ...(context ? { context } : {}),
    }));
  };

  for (const contentItem of pkg.manifest) {
    if (!contentItem.mediaOverlay) continue;
    const overlay = byId.get(contentItem.mediaOverlay);
    if (!overlay || !overlay.exists) continue; // Ausência já detectada em validateOpf.
    if (overlay.mediaType !== 'application/smil+xml') {
      notify('MEDIA_OVERLAY_INVALID_TARGET', pkg.opfPath,
        'Media Overlay não aponta para SMIL',
        'O atributo media-overlay precisa referenciar um recurso application/smil+xml.',
        contentItem.id);
    }
  }

  for (const item of overlays) {
    if (!item.exists) continue;
    const bytes = loaded.files.get(item.resolvedPath)?.bytes;
    if (!bytes) continue;
    let doc: Document;
    try {
      doc = parseXml(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (error) {
      notify('MEDIA_OVERLAY_INVALID_XML', item.resolvedPath,
        'Documento SMIL não pôde ser interpretado',
        error instanceof Error ? error.message : 'XML inválido.');
      continue;
    }
    if (doc.documentElement.localName !== 'smil' ||
        !SMIL_NAMESPACE.test(doc.documentElement.namespaceURI ?? '')) {
      notify('MEDIA_OVERLAY_INVALID_STRUCTURE', item.resolvedPath,
        'Raiz SMIL ou namespace inválidos',
        'O documento deve ter raiz smil no namespace SMIL oficial.');
      continue;
    }
    const nodes = Array.from(doc.getElementsByTagName('*'))
      .filter((node) => SMIL_NAMESPACE.test(node.namespaceURI ?? ''));
    const bodies = nodes.filter((node) => node.localName === 'body');
    const pars = nodes.filter((node) => node.localName === 'par');
    if (bodies.length !== 1 || pars.length === 0) {
      notify('MEDIA_OVERLAY_INVALID_STRUCTURE', item.resolvedPath,
        'Media Overlay sem sequência de sincronização',
        'O SMIL deve ter um body e pelo menos um par com conteúdo narrado.');
      continue;
    }

    // Mesmo se o SMIL tem um body, não confiar em estruturas importadas
    // de outro namespace para fabricar sincronizações.
    const identities = new Set<string>();
    for (const node of nodes) {
      const identity = node.getAttribute('id')?.trim();
      if (!identity) continue;
      if (identities.has(identity)) {
        notify('MEDIA_OVERLAY_DUPLICATE_ID', item.resolvedPath,
          'Identificador SMIL duplicado',
          'Dois elementos SMIL declaram o mesmo id, tornando referências ambíguas.',
          identity);
      }
      identities.add(identity);
    }

    for (const [index, par] of pars.entries()) {
      const children = Array.from(par.children);
      const texts = children.filter((node) => node.localName === 'text' &&
        SMIL_NAMESPACE.test(node.namespaceURI ?? ''));
      const audios = children.filter((node) => node.localName === 'audio' &&
        SMIL_NAMESPACE.test(node.namespaceURI ?? ''));
      const reference = `par ${index + 1}`;
      if (texts.length !== 1 || audios.length > 1 ||
          children.some((node) => !SMIL_NAMESPACE.test(node.namespaceURI ?? '') ||
            !['text', 'audio'].includes(node.localName))) {
        notify('MEDIA_OVERLAY_INVALID_STRUCTURE', item.resolvedPath,
          'Par SMIL sem um único destino textual',
          'Cada par deve ter exatamente um text e no máximo um audio.', reference);
        continue;
      }
      const textTarget = texts[0]?.getAttribute('src')?.trim() ?? '';
      if (!textTarget || isRemoteUrl(textTarget)) {
        notify('MEDIA_OVERLAY_INVALID_TARGET', item.resolvedPath,
          'Destino textual SMIL inválido',
          'O elemento text precisa de src apontando para um documento local.', reference);
        continue;
      }
      const target = resolveReference(item.resolvedPath, textTarget);
      const targetItem = pkg.manifest.find((source) => source.resolvedPath === target.path);
      if (target.safe && loaded.files.has(target.path) &&
          (!targetItem || !['application/xhtml+xml','image/svg+xml'].includes(targetItem.mediaType))) {
        notify('MEDIA_OVERLAY_INVALID_TARGET', item.resolvedPath,
          'Documento textual sincronizado não é conteúdo EPUB declarado',
          'O elemento text precisa apontar para um XHTML ou SVG declarado no manifest.',
          textTarget);
      }
      if (!target.safe || !loaded.files.has(target.path)) {
        notify('MEDIA_OVERLAY_MISSING_RESOURCE', item.resolvedPath,
          'Texto sincronizado não encontrado',
          'O src do elemento text aponta para recurso local ausente ou inseguro.', textTarget);
      } else {
        const hash = textTarget.indexOf('#');
        if (hash >= 0 && hash < textTarget.length - 1) {
          const fragmentRaw = textTarget.slice(hash + 1);
          try {
            const fragment = decodeURIComponent(fragmentRaw);
            const xhtml = loaded.files.get(target.path)?.bytes;
            if (xhtml && /\.(?:xhtml?|svg)$/iu.test(target.path)) {
              const textDoc = parseXml(
                new TextDecoder('utf-8', { fatal: true }).decode(xhtml)
                  .replace(/&nbsp;/giu, '&#160;'),
              );
              const exists = Array.from(textDoc.getElementsByTagName('*')).some(
                (node) => node.getAttribute('id') === fragment,
              );
              if (!exists) {
                notify('MEDIA_OVERLAY_MISSING_FRAGMENT', item.resolvedPath,
                  'Ponto de sincronização textual ausente',
                  'O identificador referenciado pelo SMIL não está no documento de leitura.',
                  textTarget);
              }
            }
          } catch {
            notify('MEDIA_OVERLAY_INVALID_TARGET', item.resolvedPath,
              'Fragmento textual não verificável',
              'O fragmento ou XML do destino não pôde ser interpretado com segurança.', textTarget);
          }
        }
      }

      const audio = audios[0];
      if (!audio) {
        const targetManifest = pkg.manifest.find((source) => source.resolvedPath === target.path);
        if (!targetManifest || !/^(?:audio|video)\//iu.test(targetManifest.mediaType)) {
          notify('MEDIA_OVERLAY_INVALID_STRUCTURE', item.resolvedPath,
            'Narração sem audio',
            'O par não contém audio e o text não referencia um conteúdo audiovisual.', reference);
        }
        continue;
      }
      const audioRef = audio.getAttribute('src')?.trim() ?? '';
      const audioIsRemote = isSafeRemoteResourceUrl(audioRef);
      const audioTarget = audioIsRemote ? undefined : resolveReference(item.resolvedPath, audioRef);
      if (!audioRef || (isRemoteUrl(audioRef) && !audioIsRemote)) {
        notify('MEDIA_OVERLAY_INVALID_TARGET', item.resolvedPath,
          'URL de áudio insegura',
          'O elemento audio tem src vazio ou um esquema não permitido.', reference);
      } else if (!audioIsRemote && (!audioTarget?.safe || !loaded.files.has(audioTarget.path))) {
        notify('MEDIA_OVERLAY_MISSING_RESOURCE', item.resolvedPath,
          'Arquivo de áudio ausente',
          'O clipe de áudio não existe no pacote EPUB.', audioRef);
      } else if (!audioIsRemote && audioTarget) {
        const audioItem = pkg.manifest.find((source) => source.resolvedPath === audioTarget.path);
        if (!audioItem || !audioItem.mediaType.toLowerCase().startsWith('audio/')) {
          notify('MEDIA_OVERLAY_INVALID_TARGET', item.resolvedPath,
            'Recurso narrado não declarado como áudio',
            'O arquivo de narração local precisa constar no manifest com MIME audio/*.',
            audioRef);
        }
      }
      const begin = parseSmilClock(audio.getAttribute('clipBegin'));
      const end = parseSmilClock(audio.getAttribute('clipEnd'));
      if ((begin !== undefined && !Number.isFinite(begin)) ||
          (end !== undefined && !Number.isFinite(end)) ||
          (end !== undefined && end <= (begin ?? 0))) {
        notify('MEDIA_OVERLAY_INVALID_TIMING', item.resolvedPath,
          'Intervalo de áudio SMIL inválido',
          'clipBegin e clipEnd precisam ser tempos válidos, com término posterior ao início.',
          reference);
      }
    }
  }
  return issues;
}

/**
 * EPUB 3.3, §9.3: metadados obrigatórios de duração global e por SMIL.
 * Não estimar metadados ausentes a partir dos clipes, que podem sobrepor-se.
 */
function validateOverlayDurations(
  loaded: LoadedEpub, pkg: PackageDocumentInfo,
  overlays: PackageDocumentInfo['manifest'],
): Issue[] {
  const issues: Issue[] = [];
  const raw = loaded.files.get(pkg.opfPath)?.bytes;
  if (!raw) return issues;
  let doc: Document;
  try {
    doc = parseXml(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  } catch {
    return issues; // Erro de OPF é diagnosticado pelo parser do pacote.
  }
  const metadata = Array.from(doc.getElementsByTagName('*'))
    .find((node) => node.localName === 'metadata');
  if (!metadata) return issues;
  const durations = Array.from(metadata.getElementsByTagName('*'))
    .filter((node) => node.localName === 'meta' &&
      node.getAttribute('property')?.trim() === 'media:duration');
  const check = (entries: Element[], label: string, context: string) => {
    if (entries.length === 0) {
      issues.push(createIssue({
        code: 'MEDIA_OVERLAY_DURATION_MISSING', severity: 'warning',
        title: 'Duração obrigatória de Media Overlay ausente',
        detail: 'Falta um meta property="media:duration" para ' + label + '.',
        file: pkg.opfPath, context, repairable: false,
      }));
      return undefined;
    }
    if (entries.length !== 1) {
      issues.push(createIssue({
        code: 'MEDIA_OVERLAY_DURATION_DUPLICATE', severity: 'warning',
        title: 'Duração de Media Overlay duplicada',
        detail: 'Deve existir uma única duração para ' + label + '.',
        file: pkg.opfPath, context, repairable: false,
      }));
      return undefined;
    }
    const time = parseSmilClock(entries[0]?.textContent ?? '');
    if (time === undefined || !Number.isFinite(time)) {
      issues.push(createIssue({
        code: 'MEDIA_OVERLAY_DURATION_INVALID', severity: 'warning',
        title: 'Duração de Media Overlay inválida',
        detail: 'O tempo de ' + label + ' não é um clock-value SMIL válido.',
        file: pkg.opfPath, context, repairable: false,
      }));
      return undefined;
    }
    return time;
  };
  const overall = check(
    durations.filter((node) => !(node.getAttribute('refines') ?? '').trim()),
    'a publicação inteira', 'global');
  const sectionTimes: number[] = [];
  for (const overlay of overlays) {
    const duration = check(durations.filter((node) =>
      node.getAttribute('refines')?.trim() === '#' + overlay.id),
    'o documento SMIL "' + overlay.id + '"', overlay.id);
    if (duration !== undefined) sectionTimes.push(duration);
  }
  // O EPUB permite arredondamento, mas diferenças acima de um segundo
  // precisam ser revistas sem mudar os tempos autorais.
  if (overall !== undefined && sectionTimes.length === overlays.length &&
      Math.abs(sectionTimes.reduce((sum, duration) => sum + duration, 0) - overall) > 1) {
    issues.push(createIssue({
      code: 'MEDIA_OVERLAY_DURATION_MISMATCH', severity: 'warning',
      title: 'Soma das durações SMIL difere da publicação',
      detail: 'A soma dos Media Overlays excede a diferença de um segundo ' +
        'em relação à duração global. Confira a sincronização editorial.',
      file: pkg.opfPath, context: 'global', repairable: false,
    }));
  }
  return issues;
}
