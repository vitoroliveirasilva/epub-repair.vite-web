// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { EPUB_MIME } from '../src/epub/utils/constants';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { repairEpub } from '../src/epub/repair/repairEpub';

type Sample = 'cnt-xhtml-support' | 'cnt-mathml-support' | 'cnt-svg-embedded';
const samples: Sample[] = ['cnt-xhtml-support', 'cnt-mathml-support', 'cnt-svg-embedded'];
const read = (sample: Sample, path: string): string =>
  readFileSync('tests/fixtures/w3c/' + sample + '/' + path, 'utf8');

async function packOfficialSource(sample: Sample): Promise<Uint8Array> {
  const zip = new JSZip();
  // Perturbação isolada: mimetype comprimido, para provar que o reparo
  // produz EPUB válido sem alterar o conteúdo editorial oficial.
  zip.file('mimetype', EPUB_MIME, { compression: 'DEFLATE' });
  zip.file('META-INF/container.xml',
    readFileSync('tests/fixtures/w3c/META-INF/container.xml'));
  for (const file of ['package.opf', 'nav.xhtml', 'content_001.xhtml']) {
    zip.file('EPUB/' + file, read(sample, 'EPUB/' + file));
  }
  return new Uint8Array(await zip.generateAsync({
    type: 'uint8array', compression: 'DEFLATE',
  }));
}

function parse(markup: string): Document {
  const doc = new DOMParser().parseFromString(markup, 'application/xhtml+xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  return doc;
}

describe('corpus externo W3C EPUB Tests, fonte oficial reempacotada offline', () => {
  for (const sample of samples) {
    it(sample + ': corrigir ZIP sem degradar texto, MathML ou SVG', async () => {
      vi.stubGlobal('Blob', NodeBlob);
      try {
        const input = await packOfficialSource(sample);
        const report = await inspectEpub(sample + '.epub', input);
        expect(report.validZip).toBe(true);
        expect(report.issues.map(issue => issue.code)).toContain('MIME_COMPRESSED');
        const result = await repairEpub(sample + '.epub', input);
        expect(result.changed).toBe(true);
        expect(result.blob).toBeDefined();
        expect(result.after.validZip).toBe(true);
        expect(result.after.stats.fatalCount).toBe(0);
        expect(result.after.issues.map(issue => issue.code)).not.toContain('MIME_COMPRESSED');
        const zip = await JSZip.loadAsync(await result.blob!.arrayBuffer());
        const originalContent = parse(read(sample, 'EPUB/content_001.xhtml'));
        const newContent = parse(await zip.file('EPUB/content_001.xhtml')!.async('string'));
        const originalBody = Array.from(originalContent.getElementsByTagName('*'))
          .find(node => node.localName === 'body');
        const newBody = Array.from(newContent.getElementsByTagName('*'))
          .find(node => node.localName === 'body');
        expect(newBody?.textContent).toBe(originalBody?.textContent);
        const nav = parse(await zip.file('EPUB/nav.xhtml')!.async('string'));
        expect(Array.from(nav.getElementsByTagName('*'))
          .find(node => node.localName === 'a')?.getAttribute('href'))
          .toBe('content_001.xhtml');
        const specialized = ['math', 'mi', 'msup', 'svg', 'path', 'g'];
        const nodes = (doc: Document, name: string) =>
          Array.from(doc.getElementsByTagName('*')).filter(node => node.localName === name);
        for (const tag of specialized) {
          expect(nodes(newContent, tag)).toHaveLength(nodes(originalContent, tag).length);
        }
        expect(nodes(newContent, 'path').map(node => node.getAttribute('d')))
          .toEqual(nodes(originalContent, 'path').map(node => node.getAttribute('d')));
      } finally {
        vi.unstubAllGlobals();
      }
    }, 30000);
  }
});
