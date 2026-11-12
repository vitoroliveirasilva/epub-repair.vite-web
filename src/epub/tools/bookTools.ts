import type { LoadedEpub, ValidationReport } from '../model/epubTypes';
import { loadEpub } from '../reader/loadEpub';
import { rebuildEpubZip } from '../repair/rebuildEpubZip';
import { assertNoNewCriticalIssues } from '../repair/repairSafety';
import { parsePackageDocument } from '../validation/opfParser';
import { inspectEpub } from '../validation/validateEpub';
import { findFirstByLocalName, parseXml, serializeXmlPreservingDeclaration } from '../utils/xmlUtils';

const DC = 'http://purl.org/dc/elements/1.1/';
const OPF = 'http://www.idpf.org/2007/opf';
const DECODER = new TextDecoder('utf-8');

export interface BookSection {
  path: string;
  title: string;
  text: string;
  truncated: boolean;
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

export function metadataFromLoaded(loaded: LoadedEpub): BookMetadata {
  const { metadata } = getMetadataNode(loaded);
  return {
    title: valueOf(metadata, 'title'),
    creator: valueOf(metadata, 'creator'),
    language: valueOf(metadata, 'language'),
    identifier: valueOf(metadata, 'identifier'),
    publisher: valueOf(metadata, 'publisher'),
    date: valueOf(metadata, 'date'),
    description: valueOf(metadata, 'description'),
    subject: valueOf(metadata, 'subject'),
    series: findMeta(metadata, 'belongs-to-collection', 'property')?.textContent?.trim() ??
      findMeta(metadata, 'calibre:series', 'name')?.getAttribute('content') ?? '',
    seriesIndex: findMeta(metadata, 'group-position', 'property')?.textContent?.trim() ??
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
  const loaded = await loadEpub(fileName, bytes, undefined, signal);
  assertValid(loaded);
  const pkg = parsePackageDocument(loaded).packageInfo;
  if (!pkg) throw new Error('Este EPUB não possui um spine válido para leitura.');
  const supported = pkg.spine.map((entry) => entry.manifestItem)
    .filter((item) => item && item.exists &&
      (item.mediaType === 'application/xhtml+xml' || item.mediaType === 'text/html'));
  const sections: BookSection[] = [];
  for (const item of supported.slice(0, 80)) {
    if (signal?.aborted) throw new DOMException('Leitura cancelada.', 'AbortError');
    if (!item) continue;
    const entry = loaded.files.get(item.resolvedPath);
    if (!entry || entry.bytes.byteLength > 4_000_000) continue;
    const raw = DECODER.decode(entry.bytes);
    let plain: string;
    let title = item.href.split('/').pop() || 'Seção sem título';
    try {
      const doc = parseXml(raw);
      const body = findFirstByLocalName(doc, 'body') ?? doc.documentElement;
      const excluded = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'svg', 'form']);
      for (const node of Array.from(body.getElementsByTagName('*'))) {
        if (excluded.has(node.localName.toLowerCase())) node.remove();
      }
      const blockNames = new Set(['h1', 'h2', 'h3', 'h4', 'p', 'li', 'blockquote', 'pre', 'figcaption']);
      const blocks = Array.from(body.getElementsByTagName('*'))
        .filter((node) => blockNames.has(node.localName.toLowerCase()))
        .filter((node) => !node.parentElement?.closest('p,li,blockquote,pre'))
        .map((node) => node.textContent?.replace(/\s+/gu, ' ').trim() ?? '')
        .filter(Boolean);
      plain = blocks.length ? blocks.join('\n\n') : (body.textContent ?? '').replace(/\s+/gu, ' ').trim();
      title = findFirstByLocalName(body, 'h1')?.textContent?.trim() ||
        findFirstByLocalName(body, 'h2')?.textContent?.trim() ||
        findFirstByLocalName(doc, 'title')?.textContent?.trim() || title;
    } catch {
      const fallbackTitle = raw.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/iu)?.[1];
      if (fallbackTitle) {
        title = fallbackTitle.replace(/<[^>]*>/gu, '').replace(/&nbsp;/giu, ' ').trim() || title;
      }
      plain = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
        .replace(/<[^>]*>/gu, ' ')
        .replace(/&nbsp;/giu, ' ')
        .replace(/&amp;/giu, '&')
        .replace(/\s+/gu, ' ').trim();
    }
    sections.push({
      path: item.resolvedPath,
      title: title.slice(0, 140),
      text: plain.slice(0, 120_000),
      truncated: plain.length > 120_000,
    });
  }
  const fixedLayout = loaded.files.get(pkg.opfPath)?.bytes &&
    /rendition:layout[^>]*pre-paginated|pre-paginated/iu.test(DECODER.decode(loaded.files.get(pkg.opfPath)!.bytes));
  return {
    title: pkg.metadata.title || fileName,
    sections,
    omitted: Math.max(0, supported.length - sections.length),
    fixedLayout: Boolean(fixedLayout),
  };
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
  const fields: Array<Exclude<MetadataField, 'series' | 'seriesIndex'>> = [
    'title', 'creator', 'language', 'identifier', 'publisher', 'date', 'description', 'subject',
  ];
  let changed = false;
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
    if (value !== valueOf(metadata, field)) {
      updateDc(metadata, doc, field, value);
      changed = true;
    }
  }
  const version = findFirstByLocalName(doc, 'package')?.getAttribute('version') ?? '2.0';
  const isEpub3 = version.startsWith('3');
  if (changes.series?.trim()) {
    if (changes.series.length > 300) throw new Error('Nome de série muito extenso.');
    updateMeta(metadata, doc, isEpub3 ? 'property' : 'name',
      isEpub3 ? 'belongs-to-collection' : 'calibre:series', changes.series.trim());
    changed = true;
  }
  if (changes.seriesIndex?.trim()) {
    const value = changes.seriesIndex.trim();
    if (!/^\d{1,4}(?:\.\d{1,3})?$/u.test(value)) throw new Error('Posição na série inválida.');
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
  if (!changed) throw new Error('Nenhuma alteração foi informada.');
  if (signal?.aborted) throw new DOMException('Edição cancelada.', 'AbortError');
  const edited = serializeXmlPreservingDeclaration(doc, original);
  const files = new Map(Array.from(loaded.files, ([name, entry]) => [name, entry.bytes]));
  files.set(path, new TextEncoder().encode(edited));
  const blob = await rebuildEpubZip(files);
  if (signal?.aborted) throw new DOMException('Edição cancelada.', 'AbortError');
  const outputName = fileName.replace(/\.epub$/iu, '') + '-metadados.epub';
  const outputBytes = await readBlobBytes(blob);
  const report = await inspectEpub(outputName, outputBytes);
  assertNoNewCriticalIssues(before, report);
  return { fileName: outputName, blob, bytes: outputBytes, report };
}

export interface KindleCheck { label: string; ok: boolean; detail: string }
export function buildKindleChecks(report: ValidationReport): KindleCheck[] {
  const relevant = report.issues.filter((issue) =>
    issue.severity === 'fatal' || issue.severity === 'error' || issue.severity === 'warning');
  const nav = relevant.filter((issue) => /NAV_|NCX_|SPINE_/u.test(issue.code));
  const image = relevant.filter((issue) => /COVER_|IMAGE_/u.test(issue.code));
  return [
    { label: 'Estrutura válida', ok: report.validZip && report.stats.fatalCount === 0 &&
      report.stats.errorCount === 0, detail: 'Problemas fatais e erros estruturais precisam de revisão.' },
    { label: 'Capa reconhecida', ok: Boolean(report.cover?.exists) && image.length === 0,
      detail: 'Confirme a capa e possíveis avisos de imagem.' },
    { label: 'Navegação', ok: Boolean(report.packageInfo?.spine.length) && nav.length === 0,
      detail: 'Confira o sumário, a ordem dos capítulos e a navegação.' },
    { label: 'Tamanho para envio web', ok: report.fileSize <= 200 * 1024 * 1024,
      detail: 'O envio pela web aceita arquivos de até 200 MB.' },
    { label: 'Alertas residuais', ok: relevant.length === 0,
      detail: relevant.length ? relevant.length + ' aviso(s)/erro(s) requerem avaliação.' :
        'Nenhum alerta de severidade elevada encontrado nesta verificação.' },
  ];
}
