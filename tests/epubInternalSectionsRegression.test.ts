import { describe, expect, it } from 'vitest';
import type { ManifestItem, PackageDocumentInfo } from '../src/epub/model/opfTypes';
import { inspectInternalNcx, recoverInternalNcx } from '../src/epub/utils/epubSectionRecovery';
import { parseXml } from '../src/epub/utils/xmlUtils';

const enc = (value: string): Uint8Array => new TextEncoder().encode(value);
const passage = 'Conteúdo narrativo de um livro sintético para testes de navegação. '.repeat(3);

function chapterFile(count: number, introductory: boolean): string {
  const sections: string[] = [];
  if (introductory) {
    sections.push('<p>Entrevista inicial</p><p>' + passage + '</p>');
  }
  for (let i = 0; i < count; i += 1) {
    sections.push('<p></p><p class="sgc1">Epígrafe de abertura para seção de teste.</p>' +
      '<p class="p2">— Fonte de teste</p><p></p><p class="calibre2">' +
      passage + '</p>' +
      Array.from({length: 18}, () => '<p class="calibre2">' + passage + '</p>').join(''));
  }
  return '<?xml version="1.0" encoding="utf-8"?>' +
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Livro</title></head>' +
    '<body>' + sections.join('') + '</body></html>';
}

function fixture(withGenerated = false): {
  pkg: PackageDocumentInfo;
  files: Map<string, Uint8Array>;
} {
  const ncxPoints = [
    '<navPoint id="original-cover" playOrder="1"><navLabel><text>Capa</text></navLabel>' +
      '<content src="Text/cover.xhtml"/></navPoint>',
    ...(withGenerated
      ? ['<navPoint id="epub-repair-text-1" playOrder="2">' +
        '<navLabel><text>Texto principal (parte 1)</text></navLabel>' +
        '<content src="Text/a.xhtml"/></navPoint>']
      : []),
    '<navPoint id="original-end" playOrder="3"><navLabel><text>Epílogo</text></navLabel>' +
      '<content src="Text/end.xhtml"/></navPoint>',
  ];
  const toc = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">' +
    '<navMap>' + ncxPoints.join('') + '</navMap></ncx>';
  const files = new Map([
    ['OPS/toc.ncx', enc(toc)],
    ['OPS/Text/cover.xhtml', enc('<html><body>Capa</body></html>')],
    ['OPS/Text/a.xhtml', enc(chapterFile(3, true))],
    ['OPS/Text/b.xhtml', enc(chapterFile(2, false))],
    ['OPS/Text/end.xhtml', enc('<html><body>Epílogo</body></html>')],
  ]);
  const paths = ['cover.xhtml', 'a.xhtml', 'b.xhtml', 'end.xhtml'];
  const manifest: ManifestItem[] = paths.map((name) => ({
    id: name, href: 'Text/' + name, mediaType: 'application/xhtml+xml',
    properties: [], resolvedPath: 'OPS/Text/' + name, pathSafe: true, exists: true,
  }));
  const ncxItem: ManifestItem = {
    id: 'ncx', href: 'toc.ncx', mediaType: 'application/x-dtbncx+xml',
    properties: [], resolvedPath: 'OPS/toc.ncx', pathSafe: true, exists: true,
  };
  return {
    files,
    pkg: {
      opfPath: 'OPS/content.opf', opfDir: 'OPS', version: '2.0',
      metadata: { title: 'Livro sintético' },
      manifest: [...manifest, ncxItem],
      spine: manifest.map((item) => ({ idref: item.id, manifestItem: item })),
      ncxItem, rootfileCount: 1,
    },
  };
}

describe('EPUB 2 com capítulos múltiplos em um único XHTML', () => {
  it('detecta cinco divisões internas, mesmo com NCX estruturalmente válido', () => {
    const { pkg, files } = fixture();
    const report = inspectInternalNcx(pkg, (path) => files.get(path));
    expect(report.sections).toHaveLength(5);
    expect(report.missing).toHaveLength(5);
    expect(report.safeToRepair).toBe(true);
  });

  it('cria destinos no próprio parágrafo e mantém textos e entradas editoriais', () => {
    const { pkg, files } = fixture();
    const before = ['OPS/Text/a.xhtml', 'OPS/Text/b.xhtml']
      .map((path) => parseXml(new TextDecoder().decode(files.get(path))).documentElement.textContent);
    const actions = recoverInternalNcx(files, pkg);
    expect(actions).toHaveLength(1);
    const toc = parseXml(new TextDecoder().decode(files.get('OPS/toc.ncx')));
    const navs = Array.from(toc.getElementsByTagName('*'))
      .filter((element) => element.localName === 'navPoint');
    expect(navs).toHaveLength(8);
    expect(navs[0]!.getAttribute('id')).toBe('original-cover');
    expect(navs[navs.length - 1]!.getAttribute('id')).toBe('original-end');
    const hrefs = navs.map((point) => Array.from(point.children)
      .find((element) => element.localName === 'content')?.getAttribute('src') ?? '');
    expect(hrefs.filter((href) => href.includes('#epub-repair-chapter-'))).toHaveLength(5);
    expect(hrefs).toContain('Text/a.xhtml');
    const after = ['OPS/Text/a.xhtml', 'OPS/Text/b.xhtml']
      .map((path) => parseXml(new TextDecoder().decode(files.get(path))).documentElement.textContent);
    expect(after).toEqual(before);
    const report = inspectInternalNcx(pkg, (path) => files.get(path));
    expect(report.missing).toHaveLength(0);
    expect(recoverInternalNcx(files, pkg)).toEqual([]);
  });

  it('substitui somente o placeholder produzido pela versão anterior', () => {
    const { pkg, files } = fixture(true);
    const original = new TextDecoder().decode(files.get('OPS/toc.ncx'));
    expect(original).toContain('Texto principal (parte 1)');
    expect(recoverInternalNcx(files, pkg)).toHaveLength(1);
    const updated = new TextDecoder().decode(files.get('OPS/toc.ncx'));
    expect(updated).not.toContain('Texto principal (parte 1)');
    expect(updated).toContain('original-cover');
    expect(updated).toContain('original-end');
    expect(updated).toContain('epub-repair-chapter-005');
  });

  it('não reescreve NCX hierárquico de autoria desconhecida', () => {
    const { pkg, files } = fixture();
    const current = new TextDecoder().decode(files.get('OPS/toc.ncx'));
    const nested = current.replace('</navPoint><navPoint id="original-end"',
      '<navPoint id="nested" playOrder="2"><navLabel><text>Subdivisão</text></navLabel>' +
      '<content src="Text/a.xhtml"/></navPoint></navPoint><navPoint id="original-end"');
    files.set('OPS/toc.ncx', enc(nested));
    expect(inspectInternalNcx(pkg, (path) => files.get(path)).safeToRepair).toBe(false);
    expect(recoverInternalNcx(files, pkg)).toEqual([]);
    expect(new TextDecoder().decode(files.get('OPS/toc.ncx'))).toBe(nested);
  });
});
