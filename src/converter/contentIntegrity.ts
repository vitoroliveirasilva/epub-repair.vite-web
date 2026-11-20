import JSZip from 'jszip';
import type { ConvertedContentIntegrity, EditableSection, PdfPageAnalysis } from './model';

export type SourceSection = EditableSection & { visualPages: PdfPageAnalysis[] };

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Verificação cancelada.', 'AbortError');
}

function normalizedText(value: string): string {
  return value.normalize('NFKC').replace(/[\s\u00ad\u200b\ufeff]+/gu, '');
}

function sourceDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function outputDocument(xml: string, sectionNumber: number): Document {
  const result = new DOMParser().parseFromString(xml, 'application/xhtml+xml');
  if (result.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Integridade não confirmada: XHTML inválido na seção ' + sectionNumber + '.');
  }
  return result;
}

function imageReferences(doc: ParentNode): Map<string, number> {
  const refs = new Map<string, number>();
  for (const image of doc.querySelectorAll('img[src]')) {
    const src = image.getAttribute('src') ?? '';
    if (!src.startsWith('../Images/')) continue;
    refs.set(src, (refs.get(src) ?? 0) + 1);
  }
  return refs;
}

export async function assertConvertedContentIntegrity(
  bytes: Uint8Array, sections: SourceSection[], signal?: AbortSignal,
): Promise<ConvertedContentIntegrity> {
  checkAborted(signal);
  const zip = await JSZip.loadAsync(bytes);
  const manifestFile = zip.file('OEBPS/content.opf');
  if (!manifestFile) {
    throw new Error('Integridade não confirmada: pacote EPUB sem manifesto OPF.');
  }
  const packageXml = outputDocument(await manifestFile.async('string'), 0);
  const manifestItems = [...packageXml.getElementsByTagName('item')];
  const manifest = new Set(manifestItems.map((node) => node.getAttribute('href') ?? ''));
  const spine = [...packageXml.getElementsByTagName('itemref')]
    .map((node) => node.getAttribute('idref'))
    .filter((id) => id?.startsWith('section-'));
  if (spine.length !== sections.length) {
    throw new Error('Integridade não confirmada: quantidade de capítulos no spine ' +
      'não corresponde à conversão.');
  }
  let imagesChecked = 0;

  for (const [index, section] of sections.entries()) {
    checkAborted(signal);
    const number = index + 1;
    const path = 'OEBPS/Text/section-' + String(number).padStart(3, '0') + '.xhtml';
    const relativePath = path.slice('OEBPS/'.length);
    const manifestItem = manifestItems.find((node) =>
      node.getAttribute('href') === relativePath);
    if (!manifestItem) {
      throw new Error('Integridade não confirmada: seção ' + number +
        ' ausente do manifesto EPUB.');
    }
    if (spine[index] !== manifestItem.getAttribute('id')) {
      throw new Error('Integridade não confirmada: ordem dos capítulos ' +
        'não foi preservada no spine.');
    }
    const file = zip.file(path);
    if (!file) {
      throw new Error('Integridade não confirmada: seção ' + number +
        ' desapareceu do EPUB final.');
    }
    const original = sourceDocument(section.html);
    const result = outputDocument(await file.async('string'), number);
    const main = result.querySelector('main');
    if (!main) {
      throw new Error('Integridade não confirmada: conteúdo da seção ' + number +
        ' não foi encontrado.');
    }
    const contentWithoutExtraImages = main.cloneNode(true) as Element;
    for (const figure of contentWithoutExtraImages.querySelectorAll('figure.visual-page')) {
      figure.remove();
    }
    const expectedText = normalizedText(original.body.textContent ?? '');
    const actualText = normalizedText(contentWithoutExtraImages.textContent ?? '');
    if (expectedText && !actualText.includes(expectedText)) {
      throw new Error('Integridade não confirmada: o texto editado da seção ' +
        number + ' não foi preservado integralmente. O arquivo não será liberado.');
    }

    const originalImages = imageReferences(original);
    const finalImages = imageReferences(main);
    for (const [src, count] of originalImages) {
      if ((finalImages.get(src) ?? 0) < count) {
        throw new Error('Integridade não confirmada: imagem da seção ' + number +
          ' foi removida durante o processamento.');
      }
    }
    for (const page of section.visualPages) {
      const src = '../Images/visual-page-' +
        String(page.pageNumber).padStart(4, '0') + '.jpg';
      if ((finalImages.get(src) ?? 0) !== 1) {
        throw new Error('Integridade não confirmada: página visual ' +
          page.pageNumber + ' não foi preservada exatamente uma vez.');
      }
    }
    for (const [src, count] of finalImages) {
      checkAborted(signal);
      const zipPath = 'OEBPS/' + src.slice(3);
      const resource = zip.file(zipPath);
      if (!resource || !manifest.has(src.slice(3))) {
        throw new Error('Integridade não confirmada: imagem ' +
          src + ' sem arquivo ou declaração no EPUB final.');
      }
      const imageBytes = await resource.async('uint8array');
      if (!imageBytes.length) {
        throw new Error('Integridade não confirmada: imagem vazia na seção ' + number + '.');
      }
      imagesChecked += count;
    }
  }

  return { sectionsChecked: sections.length, imageReferencesChecked: imagesChecked };
}
