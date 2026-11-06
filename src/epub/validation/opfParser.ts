import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import type {
  ManifestItem,
  PackageDocumentInfo,
  PackageMetadata,
  SpineItem,
} from '../model/opfTypes';
import { createIssue } from '../utils/issueFactory';
import { guessMediaType } from '../utils/mediaTypes';
import { dirname, isRemoteUrl, isSafeRemoteResourceUrl, normalizeInternalPath, normalizePath, resolveFromDir } from '../utils/pathUtils';
import {
  childElementsByLocalName,
  findByLocalName,
  findFirstByLocalName,
  getAttr,
  parseXml,
  textOfFirstLocalName,
} from '../utils/xmlUtils';

export interface ParsedPackageResult {
  packageInfo?: PackageDocumentInfo;
  issues: Issue[];
}

export function parsePackageDocument(loaded: LoadedEpub): ParsedPackageResult {
  const issues: Issue[] = [];
  let opfPath: string | undefined;
  let rootfileCount = 0;

  const container = loaded.files.get('META-INF/container.xml');
  if (!container) {
    issues.push(
      createIssue({
        code: 'CONTAINER_MISSING',
        severity: 'error',
        title: 'container.xml ausente',
        detail: 'O arquivo META-INF/container.xml informa onde fica o pacote OPF.',
        file: 'META-INF/container.xml',
        repairable: true,
      }),
    );
    opfPath = guessOpfPath(loaded.fileNames);
  } else {
    try {
      const containerXml = bytesToText(container.bytes);
      const doc = parseXml(containerXml);
      const rootfiles = findByLocalName(doc, 'rootfile');
      rootfileCount = rootfiles.length;
      if (rootfiles.length > 1) {
        issues.push(
          createIssue({
            code: 'CONTAINER_MULTIPLE_ROOTFILES',
            severity: 'info',
            title: 'container.xml tem múltiplos rootfiles',
            detail: 'O app prioriza o primeiro rootfile com MIME OPF correto e caminho seguro. Outros renditions permanecem preservados.',
            file: 'META-INF/container.xml',
            repairable: false,
          }),
        );
      }

      const available = (rootfile: Element): boolean => {
        const path = getAttr(rootfile, 'full-path') ?? '';
        const normalized = normalizeInternalPath(path);
        return normalized.safe && path.toLowerCase().endsWith('.opf') &&
          loaded.files.has(normalized.path);
      };
      const selected = rootfiles.find((rootfile) =>
        getAttr(rootfile, 'media-type') === 'application/oebps-package+xml' &&
        available(rootfile),
      ) ?? rootfiles.find(available) ?? rootfiles[0];
      if (selected && getAttr(selected, 'media-type') !== 'application/oebps-package+xml') {
        issues.push(createIssue({
          code: 'CONTAINER_ROOTFILE_MEDIA_TYPE_INVALID',
          severity: 'warning',
          title: 'rootfile não declara MIME OPF esperado',
          detail: 'O rootfile selecionado precisa de media-type="application/oebps-package+xml".',
          file: 'META-INF/container.xml',
          repairable: false,
        }));
      }
      opfPath = getAttr(selected, 'full-path');

      if (!opfPath) {
        issues.push(
          createIssue({
            code: 'CONTAINER_NO_ROOTFILE',
            severity: 'error',
            title: 'container.xml sem rootfile válido',
            detail: 'Não foi encontrado um full-path apontando para o OPF.',
            file: 'META-INF/container.xml',
            repairable: true,
          }),
        );
        opfPath = guessOpfPath(loaded.fileNames);
      }
    } catch (error) {
      issues.push(
        createIssue({
          code: 'CONTAINER_INVALID_XML',
          severity: 'error',
          title: 'container.xml inválido',
          detail: error instanceof Error ? error.message : 'O XML do container não pôde ser lido.',
          file: 'META-INF/container.xml',
          repairable: true,
        }),
      );
      opfPath = guessOpfPath(loaded.fileNames);
    }
  }

  const normalizedOpf = opfPath ? normalizePath(opfPath) : undefined;
  if (!normalizedOpf || !loaded.files.has(normalizedOpf)) {
    issues.push(
      createIssue({
        code: 'OPF_MISSING',
        severity: 'fatal',
        title: 'Documento OPF não encontrado',
        detail: 'Não foi possível localizar o arquivo .opf que descreve o conteúdo do EPUB.',
        file: normalizedOpf,
        repairable: false,
      }),
    );
    return { issues };
  }

  const opfEntry = loaded.files.get(normalizedOpf);
  if (!opfEntry) return { issues };

  try {
    const doc = parseXml(bytesToText(opfEntry.bytes));
    return {
      packageInfo: parseOpfDocument(doc, normalizedOpf, loaded.files, rootfileCount),
      issues,
    };
  } catch (error) {
    issues.push(
      createIssue({
        code: 'OPF_INVALID_XML',
        severity: 'fatal',
        title: 'OPF inválido',
        detail: error instanceof Error ? error.message : 'O OPF não pôde ser lido como XML válido.',
        file: normalizedOpf,
        repairable: false,
      }),
    );
    return { issues };
  }
}

export function parseOpfDocument(
  doc: Document,
  opfPath: string,
  files: Map<string, unknown>,
  rootfileCount = 1,
): PackageDocumentInfo {
  const packageElement = findFirstByLocalName(doc, 'package');
  const version = getAttr(packageElement, 'version') ?? '2.0';
  const opfDir = dirname(opfPath);
  const metadataRoot = findFirstByLocalName(doc, 'metadata');
  const metadata: PackageMetadata = {
    title: metadataRoot ? textOfFirstLocalName(metadataRoot, 'title') : undefined,
    language: metadataRoot ? textOfFirstLocalName(metadataRoot, 'language') : undefined,
    identifier: metadataRoot ? textOfFirstLocalName(metadataRoot, 'identifier') : undefined,
    date: metadataRoot ? textOfFirstLocalName(metadataRoot, 'date') : undefined,
    modified:
      findByLocalName(doc, 'meta')
        .find((meta) => getAttr(meta, 'property') === 'dcterms:modified')
        ?.textContent?.trim() || undefined,
  };

  const manifestRoot = findFirstByLocalName(doc, 'manifest');
  const manifest = childElementsByLocalName(manifestRoot, 'item').map((element): ManifestItem => {
    const href = getAttr(element, 'href') ?? '';
    const remote = isSafeRemoteResourceUrl(href);
    const unsafeScheme = isRemoteUrl(href) && !remote;
    const resolved = remote || unsafeScheme ? undefined : resolveFromDir(opfDir, href);
    const resourcePath = remote || unsafeScheme ? href : resolved?.path ?? '';
    return {
      id: getAttr(element, 'id') ?? '',
      href,
      mediaType:
        getAttr(element, 'media-type') ??
        guessMediaType(remote || unsafeScheme ? href.split(/[?#]/u)[0] ?? '' : resourcePath) ??
        'application/octet-stream',
      properties: (getAttr(element, 'properties') ?? '').split(/\s+/u).filter(Boolean),
      fallback: getAttr(element, 'fallback'),
      mediaOverlay: getAttr(element, 'media-overlay'),
      resolvedPath: resourcePath,
      pathSafe: remote || (!unsafeScheme && Boolean(resolved?.safe)),
      pathReason: unsafeScheme
        ? 'Esquema de URL não permitido no manifest'
        : resolved?.reason,
      exists: !remote && !unsafeScheme && files.has(resourcePath),
      remote,
    };
  });

  const manifestById = new Map(manifest.map((item) => [item.id, item]));
  const spineRoot = findFirstByLocalName(doc, 'spine');
  const spine: SpineItem[] = childElementsByLocalName(spineRoot, 'itemref').map((element) => {
    const idref = getAttr(element, 'idref') ?? '';
    return {
      idref,
      linear: getAttr(element, 'linear'),
      manifestItem: manifestById.get(idref),
    };
  });

  const navItem = manifest.find((item) => item.properties.includes('nav'));
  const tocId = getAttr(spineRoot, 'toc');
  const ncxItem =
    (tocId ? manifestById.get(tocId) : undefined) ??
    manifest.find((item) => item.mediaType === 'application/x-dtbncx+xml');
  const coverMeta = findByLocalName(doc, 'meta').find((meta) => getAttr(meta, 'name') === 'cover');
  const coverMetaId = coverMeta?.getAttribute('content')?.trim() || undefined;
  const coverItem =
    (coverMetaId ? manifestById.get(coverMetaId) : undefined) ??
    manifest.find((item) => item.properties.includes('cover-image'));

  return {
    opfPath,
    opfDir,
    version,
    metadata,
    manifest,
    spine,
    navItem,
    ncxItem,
    coverItem,
    coverMetaId,
    coverMetaDeclared: Boolean(coverMeta),
    rootfileCount,
  };
}

export function guessOpfPath(fileNames: string[]): string | undefined {
  const opfs = fileNames.filter((name) => name.toLowerCase().endsWith('.opf'));
  if (opfs.length === 0) return undefined;
  const preferred = [
    'OEBPS/content.opf',
    'OPS/content.opf',
    'EPUB/content.opf',
    'content.opf',
    'OEBPS/package.opf',
    'OPS/package.opf',
    'EPUB/package.opf',
    'package.opf',
  ];

  return preferred.map((candidate) => opfs.find((opf) =>
    opf.toLowerCase() === candidate.toLowerCase())).find((path) => Boolean(path)) ?? opfs[0];
}

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}
