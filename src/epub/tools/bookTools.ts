import type { LoadedEpub, ValidationReport } from '../model/epubTypes';
import { loadEpub } from '../reader/loadEpub';
import { rebuildEpubZip } from '../repair/rebuildEpubZip';
import { assertNoNewCriticalIssues } from '../repair/repairSafety';
import { parsePackageDocument } from '../validation/opfParser';
import { inspectEpub } from '../validation/validateEpub';
import { findFirstByLocalName, parseXml, serializeXmlPreservingDeclaration } from '../utils/xmlUtils';
import { readRichBookPreview, type BookBlock } from './bookReader';
import { additionalCreators, updateAdditionalCreators } from './metadataContributors';

const DC = 'http://purl.org/dc/elements/1.1/';
const OPF = 'http://www.idpf.org/2007/opf';
const DECODER = new TextDecoder('utf-8');

export interface BookSection {
  path: string;
  title: string;
  text: string;
  truncated: boolean;
  blocks?: BookBlock[] | undefined;
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
    let uid = 'epub-repair-uid';
    let index = 1;
    while (Array.from(doc.querySelectorAll('[id]')).some((node) => node.id === uid)) {
      uid = 'epub-repair-uid-' + index++;
    }
    identifier.setAttribute('id', uid);
  }
  findFirstByLocalName(doc, 'package')?.setAttribute('unique-identifier',
    identifier.getAttribute('id') ?? 'epub-repair-uid');
  identifier.textContent = value;
}

export function metadataFromLoaded(loaded: LoadedEpub): BookMetadata {
  const { doc, metadata } = getMetadataNode(loaded);
  const seriesNode = findMeta(metadata, 'belongs-to-collection', 'property');
  const positions = Array.from(metadata.children).filter((node) =>
    node.localName === 'meta' && node.getAttribute('property') === 'group-position');
  const selectedPosition = seriesNode?.id
    ? positions.find((node) => node.getAttribute('refines') === '#' + seriesNode.id)
    : positions[0];
  return {
    title: valueOf(metadata, 'title'),
    creator: valueOf(metadata, 'creator'),
    additionalCreators: additionalCreators(metadata),
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
  const fields: Array<Exclude<MetadataField, 'series' | 'seriesIndex' | 'additionalCreators'>> = [
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
    if (!/^\d{1,4}(?:\.\d{1,3})?$/u.test(value)) throw new Error('Posição na série inválida.');
    const originalIndex = isEpub3
      ? findMeta(metadata, 'group-position', 'property')?.textContent?.trim() ?? ''
      : findMeta(metadata, 'calibre:series_index', 'name')?.getAttribute('content') ?? '';
    if (originalIndex !== value) {
    if (isEpub3) {
      const series = findMeta(metadata, 'belongs-to-collection', 'property');
      if (!series?.textContent?.trim()) {
        throw new Error('Informe a série para definir a posição do volume em EPUB 3.');
      }
      if (!series.id) {
        let id = 'epub-repair-series';
        let index = 1;
        while (Array.from(doc.querySelectorAll('[id]')).some((node) => node.id === id)) {
          id = 'epub-repair-series-' + index++;
        }
        series.id = id;
      }
      updateMeta(metadata, doc, 'property', 'group-position', value);
      findMeta(metadata, 'group-position', 'property')?.setAttribute('refines', '#' + series.id);
    } else {
      updateMeta(metadata, doc, 'name', 'calibre:series_index', value);
    }
      changed = true;
    }
  }
  if (changes.additionalCreators !== undefined &&
    updateAdditionalCreators(doc, metadata, changes.additionalCreators)) changed = true;
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

export function buildKindleChecks(report: ValidationReport): KindleCheck[] {
  const issue = report.issues.filter((item) =>
    item.severity === 'fatal' || item.severity === 'error' || item.severity === 'warning');
  const packageInfo = report.packageInfo;
  const hasFatal = !report.validZip || report.stats.fatalCount > 0;
  const hasErrors = report.stats.errorCount > 0;
  const navIssues = issue.filter((item) => /^(?:NAV_|NCX_|SPINE_|TOC_)/u.test(item.code));
  const imageIssues = issue.filter((item) => /^(?:COVER_|IMAGE_)/u.test(item.code));
  const metadataIssues = issue.filter((item) => /^(?:OPF_(?:TITLE|LANGUAGE|IDENTIFIER|UNIQUE)|METADATA_)/u.test(item.code));
  const activeIssues = issue.filter((item) =>
    /(?:ACTIVE|SCRIPT|REMOTE|EXTERNAL|SECURITY|ENCRYPT|DRM)/iu.test(item.code));
  const metadata = packageInfo?.metadata;
  const title = Boolean(metadata?.title?.trim());
  const language = Boolean(metadata?.language?.trim());
  const identifier = Boolean(metadata?.identifier?.trim());
  const missing = [!title ? 'título' : '', !language ? 'idioma' : '',
    !identifier ? 'identificador' : ''].filter(Boolean);
  const nav = packageInfo?.version.startsWith('3')
    ? packageInfo.navItem : packageInfo?.ncxItem ?? packageInfo?.navItem;
  const navigationReady = Boolean(nav?.exists && nav.pathSafe &&
    packageInfo?.spine.length && navIssues.length === 0);
  const remote = packageInfo?.manifest.filter((item) =>
    item.remote || /^https?:\/\//iu.test(item.href)) ?? [];
  const missingResources = packageInfo?.manifest.filter((item) =>
    !item.exists && !item.remote) ?? [];
  const hasCover = Boolean(report.cover?.exists);
  const coverDeclared = Boolean(report.cover?.declared);
  const coverReady = hasCover && coverDeclared && imageIssues.length === 0;
  const checks: KindleCheck[] = [];
  const push = (label: string, status: KindleStatus, detail: string, action: string): void => {
    checks.push({ label, status, ok: status === 'ready', detail, action });
  };
  push('Estrutura válida',
    hasFatal ? 'blocked' : hasErrors ? 'review' : 'ready',
    hasFatal ? 'O EPUB possui problema fatal ou ZIP inválido.' :
      hasErrors ? report.stats.errorCount + ' erro(s) estrutural(is) identificado(s).' :
        'Nenhum erro estrutural de gravidade alta detectado.',
    'Valide e repare o arquivo antes de enviá-lo.');
  push('Metadados essenciais',
    !title || !language || !identifier || metadataIssues.length ? 'review' : 'ready',
    missing.length ? 'Faltam: ' + missing.join(', ') + '.' :
      metadataIssues.length ? metadataIssues.length + ' alerta(s) nos metadados.' :
        'Título, idioma e identificador presentes.',
    'Use o editor de metadados para preencher as informações ausentes.');
  push('Capa reconhecida', coverReady ? 'ready' : 'review',
    !hasCover ? 'Nenhuma imagem de capa reconhecida.' :
      !coverDeclared ? 'Imagem identificada, mas sem declaração explícita como capa.' :
        imageIssues.length ? imageIssues.length + ' alerta(s) relacionados à imagem da capa.' :
          'Capa encontrada e declarada.',
    'Confira a capa no relatório; se necessário, substitua ou repare a declaração.');
  push('Navegação', navigationReady ? 'ready' : 'review',
    !packageInfo?.spine.length ? 'Não há capítulos de leitura no spine.' :
      !nav?.exists ? 'Sumário de navegação ausente ou inválido para a versão do EPUB.' :
        navIssues.length ? navIssues.length + ' alerta(s) no sumário ou spine.' :
          'Sumário de navegação e ordem de leitura identificados.',
    'Confira a ordem dos capítulos e a navegação no relatório EPUB.');
  push('Recursos e dependências',
    missingResources.length ? 'review' : 'ready',
    missingResources.length ? missingResources.length + ' recurso(s) do manifesto não encontrado(s).' :
      'Referências locais do manifesto presentes.',
    'Corrija imagens, estilos ou recursos ausentes antes do envio.');
  push('Conteúdo externo ou ativo',
    activeIssues.length || remote.length ? 'review' : 'ready',
    remote.length ? remote.length + ' recurso(s) remoto(s) referenciado(s).' :
      activeIssues.length ? activeIssues.length + ' alerta(s) de conteúdo ativo/segurança.' :
        'Nenhum alerta relevante de conteúdo remoto ou ativo detectado.',
    'Prefira conteúdos autossuficientes; revise dependências externas e scripts.');
  const fileSizeOk = report.fileSize <= 200 * 1024 * 1024;
  push('Tamanho para envio web', fileSizeOk ? 'ready' : 'blocked',
    fileSizeOk ? 'O arquivo está abaixo do limite de referência de 200 MB.' :
      'O arquivo ultrapassa o limite de referência de 200 MB.',
    'Consulte o limite atualizado do Send to Kindle e reduza o arquivo se necessário.');
  push('Alertas residuais', issue.length ? 'review' : 'ready',
    issue.length ? issue.length + ' alerta(s)/erro(s) exigem avaliação.' :
      'Nenhum alerta de severidade elevada encontrado.',
    'Revise os avisos no relatório técnico, mesmo se os demais itens estiverem adequados.');
  return checks;
}
