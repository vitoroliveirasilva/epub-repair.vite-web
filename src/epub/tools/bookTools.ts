import type { LoadedEpub, ValidationReport } from '../model/epubTypes';
import { loadEpub } from '../reader/loadEpub';
import { rebuildEpubZip } from '../repair/rebuildEpubZip';
import { assertNoNewCriticalIssues } from '../repair/repairSafety';
import { parsePackageDocument } from '../validation/opfParser';
import { inspectEpub } from '../validation/validateEpub';
import { findFirstByLocalName, parseXml, serializeXmlPreservingDeclaration } from '../utils/xmlUtils';
import { readRichBookPreview, type BookBlock } from './bookReader';
import { additionalCreators, additionalCreatorRoles,
  updateAdditionalCreators, updateAdditionalCreatorRoles } from './metadataContributors';

const DC = 'http://purl.org/dc/elements/1.1/';
const OPF = 'http://www.idpf.org/2007/opf';
const DECODER = new TextDecoder('utf-8');

export interface BookSection {
  path: string;
  title: string;
  text: string;
  truncated: boolean;
  blocks?: BookBlock[] | undefined;
  styleFingerprint?: string | undefined;
}
export interface BookPreview {
  title: string;
  sections: BookSection[];
  omitted: number;
  fixedLayout: boolean;
}
export interface BookMetadata {
  title: string;
  creator: string;
  additionalCreators: string;
  additionalCreatorRoles: string;
  language: string;
  identifier: string;
  publisher: string;
  date: string;
  description: string;
  subject: string;
  series: string;
  seriesIndex: string;
}
export type MetadataField = keyof BookMetadata;

function assertValid(loaded: LoadedEpub): void {
  if (!loaded.validZip || loaded.issues.some((issue) => issue.severity === 'fatal')) {
    throw new Error('O EPUB não pôde ser aberto com segurança.');
  }
}

function directChild(parent: Element, name: string): Element | undefined {
  return Array.from(parent.children).find((child) => child.localName === name);
}

function getMetadataNode(loaded: LoadedEpub): { path: string; doc: Document; metadata: Element; original: string } {
  assertValid(loaded);
  const pkg = parsePackageDocument(loaded).packageInfo;
  if (!pkg) throw new Error('O pacote OPF está ausente ou inválido.');
  const entry = loaded.files.get(pkg.opfPath);
  if (!entry) throw new Error('OPF indisponível.');
  const original = DECODER.decode(entry.bytes);
  const doc = parseXml(original);
  const metadata = findFirstByLocalName(doc, 'metadata');
  if (!metadata) throw new Error('Não foi possível encontrar a seção de metadados.');
  return { path: pkg.opfPath, doc, metadata, original };
}

function valueOf(parent: Element, local: string): string {
  return directChild(parent, local)?.textContent?.trim() ?? '';
}

function findMeta(parent: Element, name: string, attr: 'name' | 'property'): Element | undefined {
  return Array.from(parent.children).find((child) => child.localName === 'meta' &&
    child.getAttribute(attr) === name);
}

function seriesPosition(metadata: Element, series?: Element): Element | undefined {
  if (!series) return undefined;
  const positions = Array.from(metadata.children).filter((node) =>
    node.localName === 'meta' && node.getAttribute('property') === 'group-position');
  const id = series.getAttribute('id');
  if (id) return positions.find((node) => node.getAttribute('refines') === '#' + id);
  const collections = Array.from(metadata.children).filter((node) =>
    node.localName === 'meta' &&
    node.getAttribute('property') === 'belongs-to-collection');
  return collections.length === 1 && positions.length === 1 &&
    !positions[0]?.getAttribute('refines') ? positions[0] : undefined;
}

function ensureUniqueMetadataId(doc: Document, base: string): string {
  const ids = new Set(Array.from(doc.getElementsByTagName('*'))
    .map((node) => node.getAttribute('id')).filter(Boolean));
  let result = base;
  let index = 2;
  while (ids.has(result)) result = base + '-' + index++;
  return result;
}

function primaryIdentifier(doc: Document, metadata: Element): Element | undefined {
  const primaryId = findFirstByLocalName(doc, 'package')?.getAttribute('unique-identifier');
  const identifiers = Array.from(metadata.children).filter((node) => node.localName === 'identifier');
  return identifiers.find((node) => node.getAttribute('id') === primaryId) ?? identifiers[0];
}

function setPrimaryIdentifier(doc: Document, metadata: Element, value: string): void {
  let identifier = primaryIdentifier(doc, metadata);
  if (!identifier) {
    identifier = doc.createElementNS(DC, 'dc:identifier');
    metadata.appendChild(identifier);
  }
  if (!identifier.getAttribute('id')) {
    identifier.setAttribute('id', ensureUniqueMetadataId(doc, 'epub-repair-uid'));
  }
  findFirstByLocalName(doc, 'package')?.setAttribute('unique-identifier',
    identifier.getAttribute('id') ?? 'epub-repair-uid');
  identifier.textContent = value;
}

export function metadataFromLoaded(loaded: LoadedEpub): BookMetadata {
  const { doc, metadata } = getMetadataNode(loaded);
  const seriesNode = findMeta(metadata, 'belongs-to-collection', 'property');
  const selectedPosition = seriesPosition(metadata, seriesNode);
  return {
    title: valueOf(metadata, 'title'),
    creator: valueOf(metadata, 'creator'),
    additionalCreators: additionalCreators(metadata),
    additionalCreatorRoles: additionalCreatorRoles(metadata),
    language: valueOf(metadata, 'language'),
    identifier: primaryIdentifier(doc, metadata)?.textContent?.trim() ?? '',
    publisher: valueOf(metadata, 'publisher'),
    date: valueOf(metadata, 'date'),
    description: valueOf(metadata, 'description'),
    subject: valueOf(metadata, 'subject'),
    series: seriesNode?.textContent?.trim() ??
      findMeta(metadata, 'calibre:series', 'name')?.getAttribute('content') ?? '',
    seriesIndex: selectedPosition?.textContent?.trim() ??
      findMeta(metadata, 'calibre:series_index', 'name')?.getAttribute('content') ?? '',
  };
}

export async function readBookMetadata(fileName: string, bytes: Uint8Array, signal?: AbortSignal): Promise<BookMetadata> {
  const loaded = await loadEpub(fileName, bytes, undefined, signal);
  return metadataFromLoaded(loaded);
}

export async function readBookPreview(
  fileName: string, bytes: Uint8Array, signal?: AbortSignal,
): Promise<BookPreview> {
  return readRichBookPreview(fileName, bytes, signal);
}

function updateDc(metadata: Element, doc: Document, name: string, value: string): void {
  const current = directChild(metadata, name);
  if (current) {
    current.textContent = value;
  } else {
    const element = doc.createElementNS(DC, 'dc:' + name);
    element.textContent = value;
    metadata.appendChild(element);
  }
}

function updateMeta(metadata: Element, doc: Document, attr: 'name' | 'property',
  name: string, value: string): void {
  let current = findMeta(metadata, name, attr);
  if (!current) {
    current = doc.createElementNS(OPF, 'meta');
    current.setAttribute(attr, name);
    metadata.appendChild(current);
  }
  if (attr === 'name') current.setAttribute('content', value);
  else current.textContent = value;
}

async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler o EPUB gerado.'));
    reader.readAsArrayBuffer(blob);
  });
}

export async function writeBookMetadata(
  fileName: string, bytes: Uint8Array, changes: Partial<BookMetadata>, signal?: AbortSignal,
): Promise<{ fileName: string; blob: Blob; bytes: Uint8Array; report: ValidationReport }> {
  const loaded = await loadEpub(fileName, bytes, undefined, signal);
  assertValid(loaded);
  if (loaded.files.has('META-INF/signatures.xml')) {
    throw new Error('Este EPUB possui assinatura digital; a edição invalidaria a assinatura.');
  }
  const before = await inspectEpub(fileName, bytes);
  if (before.stats.fatalCount > 0) throw new Error('Corrija os problemas fatais antes de editar metadados.');
  const { path, doc, metadata, original } = getMetadataNode(loaded);
  const fields: Array<Exclude<MetadataField,
    'series' | 'seriesIndex' | 'additionalCreators' | 'additionalCreatorRoles'>> = [
    'title', 'creator', 'language', 'identifier', 'publisher', 'date', 'description', 'subject',
  ];
  let changed = false;
  let oldIdentifier = '';
  let newIdentifier = '';
  for (const field of fields) {
    const raw = changes[field];
    if (raw === undefined) continue;
    const value = raw.trim();
    if (!value) continue;
    if (value.length > (field === 'description' ? 6000 : 300)) {
      throw new Error('O campo ' + field + ' excede o tamanho aceito.');
    }
    if (field === 'language' && !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/iu.test(value)) {
      throw new Error('Idioma inválido. Use pt-BR, en ou outro código BCP 47.');
    }
    const previous = field === 'identifier'
      ? primaryIdentifier(doc, metadata)?.textContent?.trim() ?? ''
      : valueOf(metadata, field);
    if (value !== previous) {
      if (field === 'identifier') {
        oldIdentifier = previous;
        newIdentifier = value;
        setPrimaryIdentifier(doc, metadata, value);
      } else {
        updateDc(metadata, doc, field, value);
      }
      changed = true;
    }
  }
  const version = findFirstByLocalName(doc, 'package')?.getAttribute('version') ?? '2.0';
  const isEpub3 = version.startsWith('3');
  if (changes.series?.trim()) {
    if (changes.series.length > 300) throw new Error('Nome de série muito extenso.');
    const originalSeries = isEpub3
      ? findMeta(metadata, 'belongs-to-collection', 'property')?.textContent?.trim() ?? ''
      : findMeta(metadata, 'calibre:series', 'name')?.getAttribute('content') ?? '';
    if (originalSeries !== changes.series.trim()) {
      updateMeta(metadata, doc, isEpub3 ? 'property' : 'name',
        isEpub3 ? 'belongs-to-collection' : 'calibre:series', changes.series.trim());
      changed = true;
    }
  }
  if (changes.seriesIndex?.trim()) {
    const value = changes.seriesIndex.trim();
    if (!/^\d{1,4}(?:\.\d{1,3})?$/u.test(value)) {
      throw new Error('Posição na série inválida.');
    }
    if (isEpub3) {
      const series = findMeta(metadata, 'belongs-to-collection', 'property');
      if (!series?.textContent?.trim()) {
        throw new Error('Informe a série para definir a posição do volume em EPUB 3.');
      }
      let id = series.getAttribute('id');
      if (!id) {
        id = ensureUniqueMetadataId(doc, 'epub-repair-series');
        series.setAttribute('id', id);
        changed = true;
      }
      let position = seriesPosition(metadata, series);
      if (!position) {
        position = doc.createElementNS(OPF, 'meta');
        position.setAttribute('property', 'group-position');
        position.setAttribute('refines', '#' + id);
        metadata.appendChild(position);
        changed = true;
      }
      if (position.textContent?.trim() !== value ||
        position.getAttribute('refines') !== '#' + id) {
        position.textContent = value;
        position.setAttribute('refines', '#' + id);
        changed = true;
      }
    } else {
      const current = findMeta(metadata, 'calibre:series_index', 'name');
      if (current?.getAttribute('content') !== value) {
        updateMeta(metadata, doc, 'name', 'calibre:series_index', value);
        changed = true;
      }
    }
  }
  if (changes.additionalCreators !== undefined &&
    updateAdditionalCreators(doc, metadata, changes.additionalCreators)) changed = true;
  if (changes.additionalCreatorRoles !== undefined &&
    updateAdditionalCreatorRoles(doc, metadata, changes.additionalCreatorRoles, isEpub3)) {
    changed = true;
  }
  if (!changed) throw new Error('Nenhuma alteração foi informada.');
  if (isEpub3) {
    updateMeta(metadata, doc, 'property', 'dcterms:modified',
      new Date().toISOString().slice(0, 19) + 'Z');
  }
  if (signal?.aborted) throw new DOMException('Edição cancelada.', 'AbortError');
  const edited = serializeXmlPreservingDeclaration(doc, original);
  const files = new Map(Array.from(loaded.files, ([name, entry]) => [name, entry.bytes]));
  files.set(path, new TextEncoder().encode(edited));
  if (newIdentifier) {
    const packageInfo = parsePackageDocument(loaded).packageInfo;
    const ncxPath = packageInfo?.ncxItem?.resolvedPath;
    const ncxEntry = ncxPath ? loaded.files.get(ncxPath) : undefined;
    if (ncxEntry && ncxPath) {
      const originalNcx = DECODER.decode(ncxEntry.bytes);
      const ncx = parseXml(originalNcx);
      const uid = Array.from(ncx.getElementsByTagName('*')).find((node) =>
        node.localName === 'meta' && node.getAttribute('name') === 'dtb:uid');
      if (uid?.getAttribute('content') === oldIdentifier) {
        uid.setAttribute('content', newIdentifier);
        files.set(ncxPath, new TextEncoder().encode(
          serializeXmlPreservingDeclaration(ncx, originalNcx)));
      }
    }
  }
  const blob = await rebuildEpubZip(files);
  if (signal?.aborted) throw new DOMException('Edição cancelada.', 'AbortError');
  const outputName = fileName.replace(/\.epub$/iu, '') + '-metadados.epub';
  const outputBytes = await readBlobBytes(blob);
  const report = await inspectEpub(outputName, outputBytes);
  assertNoNewCriticalIssues(before, report);
  return { fileName: outputName, blob, bytes: outputBytes, report };
}

export type KindleStatus = 'ready' | 'review' | 'blocked';
export interface KindleCheck {
  label: string;
  ok: boolean;
  status: KindleStatus;
  detail: string;
  action: string;
}
export interface KindleReadiness {
  status: KindleStatus;
  ready: number;
  review: number;
  blocked: number;
}

export function summarizeKindleChecks(checks: KindleCheck[]): KindleReadiness {
  const blocked = checks.filter((check) => check.status === 'blocked').length;
  const review = checks.filter((check) => check.status === 'review').length;
  const ready = checks.filter((check) => check.status === 'ready').length;
  return { status: blocked ? 'blocked' : review ? 'review' : 'ready',
    ready, review, blocked };
}

export const KINDLE_WEB_SIZE_LIMIT = 200 * 1024 * 1024;

export function buildKindleChecks(report: ValidationReport): KindleCheck[] {
  const issues = report.issues.filter((item) =>
    item.severity === 'fatal' || item.severity === 'error' || item.severity === 'warning');
  const pkg = report.packageInfo;
  const packageBroken = !report.validZip || report.stats.fatalCount > 0 ||
    !pkg || !pkg.spine.length || !pkg.opfPath;
  const metadataIssues = issues.filter((item) =>
    /^(?:OPF_(?:TITLE|LANGUAGE|IDENTIFIER|UNIQUE|MODIFIED|DATE|REFINES|PREFIX|METADATA)|PACKAGE_SEMANTICS|METADATA_)/u
      .test(item.code));
  const navIssues = issues.filter((item) =>
    /^(?:NAV_|NCX_|SPINE_|TOC_|OPF_SPINE_)/u.test(item.code));
  const coverIssues = issues.filter((item) => /^(?:COVER_|OPF_COVER_|IMAGE_)/u.test(item.code));
  const dependencies = issues.filter((item) =>
    /^(?:CONTENT_MISSING_RESOURCE|CONTENT_KINDLE_EMBED_BROKEN|CSS_MISSING_RESOURCE|OPF_MISSING_RESOURCE|OPF_FALLBACK_)/u
      .test(item.code));
  const remoteActive = issues.filter((item) =>
    /(?:ACTIVE|SCRIPT|REMOTE|EXTERNAL|SECURITY|ENCRYPT|DRM|UNSAFE|SUSPICIOUS)/iu
      .test(item.code));
  const encryption = issues.filter((item) =>
    /(?:DRM|ENCRYPT|ZIP_ENCRYPTED_ENTRY)/iu.test(item.code));
  const accessibility = issues.filter((item) =>
    /^(?:CONTENT_(?:IMAGE_ALT_MISSING|ARIA_|FOOTNOTE_|LANGUAGE_CONFLICT|LINK_NAME_MISSING)|XHTML_LANG_MISSING)/u
      .test(item.code));
  const layout = report.issues.filter((item) =>
    /^(?:FIXED_LAYOUT_|IMAGE_PROGRESSIVE_JPEG|OPF_PACKAGE_VERSION_UNSUPPORTED|KINDLE_COMPATIBILITY)/u
      .test(item.code));
  const title = Boolean(pkg?.metadata.title?.trim());
  const language = Boolean(pkg?.metadata.language?.trim());
  const identifier = Boolean(pkg?.metadata.identifier?.trim());
  const missing = [!title ? 'título' : '', !language ? 'idioma' : '',
    !identifier ? 'identificador' : ''].filter(Boolean);
  const nav = pkg?.version.startsWith('3')
    ? pkg.navItem : pkg?.ncxItem ?? pkg?.navItem;
  const navigationReady = Boolean(nav?.exists && nav.pathSafe &&
    pkg?.spine.length && navIssues.length === 0);
  const remote = pkg?.manifest.filter((item) =>
    item.remote || /^https?:\/\//iu.test(item.href)) ?? [];
  const missingResources = pkg?.manifest.filter((item) =>
    !item.exists && !item.remote) ?? [];
  const hasCover = Boolean(report.cover?.exists);
  const coverDeclared = Boolean(report.cover?.declared);
  const checks: KindleCheck[] = [];
  const push = (label: string, status: KindleStatus, detail: string, action: string): void => {
    checks.push({ label, status, ok: status === 'ready', detail, action });
  };

  push('Estrutura válida',
    packageBroken ? 'blocked' : report.stats.errorCount > 0 ? 'review' : 'ready',
    packageBroken ? 'ZIP, pacote OPF ou ordem de leitura ausente/inválida.' :
      report.stats.errorCount > 0 ? report.stats.errorCount + ' erro(s) no EPUB.' :
        'Nenhum problema estrutural grave foi identificado.',
    'Valide e repare o EPUB. Erros estruturais remanescentes exigem conferência.');
  push('Metadados essenciais',
    missing.length || metadataIssues.length ? 'review' : 'ready',
    missing.length ? 'Faltam: ' + missing.join(', ') + '.' :
      metadataIssues.length ? metadataIssues.length + ' alerta(s) sobre metadados.' :
        'Título, idioma e identificador principal presentes.',
    'Complete título, idioma e identificador; confira IDs e refinamentos no OPF.');
  push('Capa reconhecida',
    !hasCover || !coverDeclared || coverIssues.length ? 'review' : 'ready',
    !hasCover ? 'Imagem de capa não identificada.' :
      !coverDeclared ? 'Imagem presente, sem declaração inequívoca de capa.' :
        coverIssues.length ? coverIssues.length + ' alerta(s) sobre imagens/capa.' :
          'Imagem e declaração de capa identificadas.',
    'Confira a capa e os metadados de capa no relatório; corrija o necessário.');
  push('Navegação',
    navigationReady ? 'ready' : 'review',
    !pkg?.spine.length ? 'O spine não contém capítulos válidos.' :
      !nav?.exists ? 'Não foi encontrado sumário adequado à versão do EPUB.' :
        navIssues.length ? navIssues.length + ' alerta(s) sobre capítulos e navegação.' :
          'Sumário e ordem de leitura encontrados.',
    'Confira TOC, NCX, links internos e ordem dos capítulos.');
  push('Recursos e dependências',
    missingResources.length || dependencies.length ? 'review' : 'ready',
    missingResources.length || dependencies.length
      ? missingResources.length + ' item(ns) ausente(s) no manifesto e ' +
        dependencies.length + ' alerta(s) de referência ou dependência.'
      : 'Arquivos locais e referências essenciais identificados.',
    'Corrija imagens, folhas de estilo e outros destinos quebrados.');
  push('Conteúdo externo ou ativo',
    encryption.length ? 'blocked' :
      remoteActive.length || remote.length ? 'review' : 'ready',
    encryption.length ? 'Há ' + encryption.length +
      ' alerta(s) de criptografia, DRM ou recurso protegido.' :
      remote.length ? remote.length + ' recurso(s) remoto(s) declarados.' :
        remoteActive.length ? remoteActive.length + ' alerta(s) de segurança.' :
          'Nenhum sinal relevante de conteúdo ativo ou externo detectado.',
    'Evite dependências remotas e scripts. Conteúdo com DRM/criptografia precisa ' +
      'de uma versão legalmente acessível, sem tentar remover a proteção.');
  const sizeOk = report.fileSize > 0 && report.fileSize <= KINDLE_WEB_SIZE_LIMIT;
  push('Tamanho para envio web', sizeOk ? 'ready' : 'blocked',
    sizeOk ? 'Arquivo dentro do limite anunciado de 200 MB para envio pela web.' :
      'Arquivo vazio ou acima de 200 MB para envio pela web.',
    'Consulte os limites atuais do Send to Kindle. O envio por e-mail possui limites diferentes.');
  push('Acessibilidade',
    accessibility.length ? 'review' : 'ready',
    accessibility.length ? accessibility.length +
      ' alerta(s) sobre imagens, idiomas, notas ou rótulos acessíveis.' :
        'Nenhuma das verificações de acessibilidade sinalizou problema.',
    'Descreva imagens relevantes, confira idioma e links, e revise as notas de rodapé.');
  push('Layout e formatos especiais',
    layout.length ? 'review' : 'ready',
    layout.length ? layout.length +
      ' alerta(s) de layout fixo, mídia ou compatibilidade Kindle.' :
        'Nenhum alerta específico de layout ou mídia detectado pela análise.',
    'Livros de layout fixo, quadrinhos e mídias complexas exigem testes no leitor real.');
  push('Alertas residuais',
    issues.length ? 'review' : 'ready',
    issues.length ? issues.length + ' alerta(s) ou erro(s) precisam de avaliação.' :
      'Nenhum alerta relevante detectado pela análise estática.',
    'Examine o relatório técnico; nenhuma verificação local garante aceite pela Amazon.');

  return checks;
}

export function exportKindleReadiness(report: ValidationReport): string {
  const checks = buildKindleChecks(report);
  return JSON.stringify({
    source: {
      fileName: report.fileName,
      fileSize: report.fileSize,
      epubVersion: report.packageInfo?.version ?? null,
    },
    summary: summarizeKindleChecks(checks),
    checks,
    guidance: {
      webLimitBytes: KINDLE_WEB_SIZE_LIMIT,
      sendToKindleUrl: 'https://www.amazon.com/sendtokindle',
      automatedUpload: false,
      limitations: 'Auditoria estática e orientativa. EPUB pode ser recusado pelo serviço ' +
        'ou apresentar diferenças no aparelho. Confira no Kindle e-reader ou aplicativo.',
    },
  }, null, 2);
}

