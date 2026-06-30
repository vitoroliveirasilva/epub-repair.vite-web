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
import { dirname, normalizePath, resolveFromDir } from '../utils/pathUtils';
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
            detail: 'O app usará o primeiro rootfile com caminho OPF válido de forma previsível.',
            file: 'META-INF/container.xml',
            repairable: false,
          }),
        );
      }

      const selected =
        rootfiles.find((rootfile) => {
          const fullPath = getAttr(rootfile, 'full-path');
          return Boolean(
            fullPath &&
            loaded.files.has(normalizePath(fullPath)) &&
            fullPath.toLowerCase().endsWith('.opf'),
          );
        }) ?? rootfiles[0];
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
    modified:
      findByLocalName(doc, 'meta')
        .find((meta) => getAttr(meta, 'property') === 'dcterms:modified')
        ?.textContent?.trim() || undefined,
  };

  const manifestRoot = findFirstByLocalName(doc, 'manifest');
  const manifest = childElementsByLocalName(manifestRoot, 'item').map((element): ManifestItem => {
    const href = getAttr(element, 'href') ?? '';
    const resolved = resolveFromDir(opfDir, href);
    return {
      id: getAttr(element, 'id') ?? '',
      href,
      mediaType:
        getAttr(element, 'media-type') ??
        guessMediaType(resolved.path) ??
        'application/octet-stream',
      properties: (getAttr(element, 'properties') ?? '').split(/\s+/u).filter(Boolean),
      fallback: getAttr(element, 'fallback'),
      resolvedPath: resolved.path,
      exists: files.has(resolved.path),
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
  const coverId = findByLocalName(doc, 'meta')
    .find((meta) => getAttr(meta, 'name') === 'cover')
    ?.getAttribute('content')
    ?.trim();
  const coverItem = coverId
    ? manifestById.get(coverId)
    : manifest.find((item) => item.properties.includes('cover-image'));

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

  return (
    preferred.find((candidate) =>
      opfs.some((opf) => opf.toLowerCase() === candidate.toLowerCase()),
    ) ?? opfs[0]
  );
}

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}
