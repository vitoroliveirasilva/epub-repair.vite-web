
import { Blob as NodeBlob } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { repairEpub } from '../src/epub/repair/repairEpub';
import { repairCoverSvgAccessibility } from '../src/epub/repair/repairCoverSvgAccessibility';
import { auditVisualStructures } from '../src/epub/repair/editorialStructureAudit';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { validateAccessibility } from '../src/epub/validation/validateAccessibility';
import { canOptimizeReport } from '../src/epub/utils/reportGuards';
import { EPUB_MIME } from '../src/epub/utils/constants';
import { BASELINE_JPEG_BYTES } from './helpers/syntheticEpub';
import { createInitialState } from '../src/app/state';
import { renderControls } from '../src/ui/components/Controls';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const pagePath = 'OPS/Text/titlepage.xhtml';
const imgPath = 'OPS/Images/cover.jpeg';
const enc = new TextEncoder();
const page = (svg: string, title = 'Cover') =>
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">' +
  '<head><title>' + title + '</title><meta name="calibre:cover" content="true"/></head>' +
  '<body><div>' + svg + '</div></body></html>';
const coverSvg = '<svg xmlns="http://www.w3.org/2000/svg" ' +
  'xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 491 751">' +
  '<image width="491" height="751" xlink:href="../Images/cover.jpeg"/></svg>';

function minimalPkg(): PackageDocumentInfo {
  const cover = {
    id: 'cover', href: 'Images/cover.jpeg', resolvedPath: imgPath,
    mediaType: 'image/jpeg', exists: true, pathSafe: true, properties: [],
  };
  return {
    opfPath: 'OPS/book.opf', opfDir: 'OPS', version: '2.0',
    metadata: { language: 'en', title: 'Synthetic book' },
    manifest: [
      cover,
      {
        id: 'title', href: 'Text/titlepage.xhtml', resolvedPath: pagePath,
        mediaType: 'application/xhtml+xml', exists: true, pathSafe: true, properties: [],
      },
    ],
    coverItem: cover, spine: [], rootfileCount: 1,
  };
}

function check(markup: string) {
  const pkg = minimalPkg();
  const loaded = { files: new Map([
    [pagePath, { path: pagePath, bytes: enc.encode(markup), directory: false }],
  ]) } as unknown as LoadedEpub;
  return { pkg, loaded, issues: validateAccessibility(loaded, pkg) };
}

async function buildEpub(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
  zip.file('META-INF/container.xml',
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" ' +
    'media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OPS/book.opf',
    '<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:11111111-2222-3333-4444-555555555555</dc:identifier>' +
    '<dc:title>Fixture de capa</dc:title><dc:language>en</dc:language>' +
    '<meta name="cover" content="cover"/></metadata><manifest>' +
    '<item id="title" href="Text/titlepage.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="cover" href="Images/cover.jpeg" media-type="image/jpeg"/>' +
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' +
    '</manifest><spine toc="ncx"><itemref idref="title"/></spine>' +
    '<guide><reference type="cover" title="Cover" href="Text/titlepage.xhtml"/></guide>' +
    '</package>');
  zip.file('OPS/toc.ncx',
    '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx" version="2005-1">' +
    '<head><meta name="dtb:uid" content="urn:uuid:11111111-2222-3333-4444-555555555555"/></head>' +
    '<docTitle><text>Fixture de capa</text></docTitle><navMap>' +
    '<navPoint id="page" playOrder="1"><navLabel><text>Capa</text></navLabel>' +
    '<content src="Text/titlepage.xhtml"/></navPoint></navMap></ncx>');
  zip.file(pagePath, page(coverSvg));
  zip.file(imgPath, BASELINE_JPEG_BYTES);
  return new Uint8Array(await zip.generateAsync({
    type: 'uint8array', compression: 'DEFLATE',
  }));
}

describe('Acessibilidade: SVG simples da capa EPUB2 não deve ficar como pendência perpétua', () => {
  it('distingue SVG de capa corrigível de diagramas que exigem revisão humana', () => {
    const cover = check(page(coverSvg));
    const issue = cover.issues.find(i => i.code === 'CONTENT_INLINE_SVG_LABEL_MISSING');
    expect(issue?.severity).toBe('info');
    expect(issue?.repairable).toBe(true);
    const unrelated = check(page(coverSvg.replace('cover.jpeg', 'diagram.jpeg')));
    expect(unrelated.issues.find(i => i.code === 'CONTENT_INLINE_SVG_LABEL_MISSING')
      ?.repairable).toBe(false);
    const complex = check(page(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
    ));
    expect(complex.issues.find(i => i.code === 'CONTENT_INLINE_SVG_LABEL_MISSING')
      ?.repairable).toBe(false);
  });

  it('insere somente aria-label e role; mantém sem alterações imagens e texto', () => {
    const original = page(coverSvg);
    const files = new Map([[pagePath, enc.encode(original)]]);
    const actions = repairCoverSvgAccessibility(files, minimalPkg());
    expect(actions).toHaveLength(1);
    const result = new TextDecoder().decode(files.get(pagePath));
    expect(result).toContain('aria-label="Cover"');
    expect(result).toContain('role="img"');
    expect(result.replace(' role="img" aria-label="Cover"', '')).toBe(original);
    expect(check(result).issues.some(i => i.code === 'CONTENT_INLINE_SVG_LABEL_MISSING'))
      .toBe(false);
    expect(repairCoverSvgAccessibility(files, minimalPkg())).toHaveLength(0);
  });

  it('a auditoria só permite rótulo aprovado e bloqueia alteração na geometria', () => {
    const original = page(coverSvg);
    const files = new Map([[pagePath, enc.encode(original)]]);
    repairCoverSvgAccessibility(files, minimalPkg());
    const labeled = new TextDecoder().decode(files.get(pagePath));
    const paths = new Set([pagePath, imgPath]);
    const audit = (text: string, approved: boolean) => auditVisualStructures(
      original, text, pagePath, 'application/xhtml+xml', paths, paths,
      undefined, true, approved,
    );

    expect(() => audit(labeled, true)).not.toThrow();
    expect(() => audit(labeled, false)).toThrow(/SVG editorial/iu);
    expect(() => audit(labeled.replace('viewBox="0 0 491 751"',
      'viewBox="0 0 999 751"'), true)).toThrow(/SVG editorial/iu);
  });

  it('preserva SVG editorial com vários elementos em vez de inventar descrição', () => {
    const original = page('<svg xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M0 0H10"/><circle r="2"/></svg>');
    const files = new Map([[pagePath, enc.encode(original)]]);
    expect(repairCoverSvgAccessibility(files, minimalPkg())).toHaveLength(0);
    expect(new TextDecoder().decode(files.get(pagePath))).toBe(original);
  });

  it('otimização de EPUB real sintético remove a nota de acessibilidade e preserva a capa', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    try {
      const input = await buildEpub();
      const before = await inspectEpub('capa.epub', input);
      expect(before.issues.some(i =>
        i.code === 'CONTENT_INLINE_SVG_LABEL_MISSING' && i.repairable)).toBe(true);
      expect(canOptimizeReport(before)).toBe(true);

      const optimized = await repairEpub('capa.epub', input, undefined, 'optimization');
      expect(optimized.changed).toBe(true);
      expect(optimized.after.issues.some(i => i.code === 'CONTENT_INLINE_SVG_LABEL_MISSING'))
        .toBe(false);
      const beforeZip = await JSZip.loadAsync(input);
      const afterZip = await JSZip.loadAsync(await optimized.blob!.arrayBuffer());
      expect(await afterZip.file(imgPath)!.async('uint8array'))
        .toEqual(await beforeZip.file(imgPath)!.async('uint8array'));
      expect(await afterZip.file('OPS/toc.ncx')!.async('uint8array'))
        .toEqual(await beforeZip.file('OPS/toc.ncx')!.async('uint8array'));
      const result = await afterZip.file(pagePath)!.async('string');
      expect(result).toContain('aria-label="Cover"');
      expect(optimized.after.stats.infoCount).toBe(0);
      expect(optimized.after.stats.kindleScore).toBe(100);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Indicador de carregamento centralizado e com toda a largura do card', () => {
  it('mantém progresso real, cancelamento e layout de largura total', () => {
    const state = createInitialState();
    state.busy = true;
    state.processingProgress = {
      phase: 'Descompactando EPUB no Worker...',
      completed: 3, total: 11,
    };
    state.processingController = new AbortController();
    const panel = renderControls(state, {
      analyze: () => {}, repair: () => {}, copy: () => {},
      downloadTextReport: () => {}, downloadJsonReport: () => {},
      cancel: () => {},
    });
    const status = panel.querySelector('.processing-status');
    expect(status?.parentElement).toBe(panel);
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.querySelector('progress')?.value).toBe(3);
    expect(status?.textContent).toContain('3 de 11 entradas');

    const css = readFileSync(resolve('src/styles/reportUx.css'), 'utf8');
    const rule = /\.controls-panel\s*>\s*\.processing-status\s*\{([^}]*)\}/u.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/width:\s*100%\s*;/u);
    expect(rule).toMatch(/justify-items:\s*center\s*;/u);
    expect(rule).toMatch(/justify-self:\s*stretch\s*;/u);
    const inner = /\.controls-panel\s+\.processing-status-content\s*\{([^}]*)\}/u.exec(css)?.[1] ?? '';
    expect(inner).toMatch(/width:\s*100%\s*;/u);
  });
});
