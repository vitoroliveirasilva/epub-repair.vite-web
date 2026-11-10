
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { IssueCode } from '../src/epub/model/issueTypes';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { hasManualReviewIssues } from '../src/epub/utils/reportGuards';







const chapter = '<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR" xml:lang="pt-BR">' +
  '<head><title>Capítulo sintético</title><link rel="stylesheet" href="style.css"/></head>' +
  '<body><h1 id="inicio">Início</h1><p>O texto original não deve desaparecer.</p></body></html>';
const nav = '<html xmlns="http://www.w3.org/1999/xhtml" ' +
  'xmlns:epub="http://www.idpf.org/2007/ops" lang="pt-BR" xml:lang="pt-BR">' +
  '<head><title>Índice</title></head><body><nav epub:type="toc"><ol>' +
  '<li><a href="chapter.xhtml#inicio">Início</a></li></ol></nav></body></html>';
const opf = '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
  '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
  '<dc:identifier id="uid">urn:uuid:synthetic-corpus</dc:identifier>' +
  '<dc:title>Obra sintética</dc:title><dc:language>pt-BR</dc:language>' +
  '<meta property="dcterms:modified">2026-11-05T12:00:00Z</meta>' +
  '</metadata><manifest>' +
  '<item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>' +
  '<item id="ch" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
  '<item id="css" href="style.css" media-type="text/css"/>' +
  '</manifest><spine><itemref idref="ch"/></spine></package>';

async function epubWith(modify?: (zip: JSZip) => void): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml',
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/>' +
    '</rootfiles></container>');
  zip.file('OPS/book.opf', opf);
  zip.file('OPS/nav.xhtml', nav);
  zip.file('OPS/chapter.xhtml', chapter);
  zip.file('OPS/style.css', 'p { color: blue; }');
  modify?.(zip);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

interface Case {
  id: string;
  expected?: IssueCode;
  absent?: IssueCode;
  mutate: (zip: JSZip) => void;
}

const scenarios: Case[] = [
  {
    id: '01-mimetype-ausente',
    expected: 'MIME_MISSING',
    mutate: (zip) => { zip.remove('mimetype'); },
  },
  {
    id: '02-fragmento-inexistente',
    expected: 'CONTENT_MISSING_FRAGMENT',
    mutate: (zip) => { zip.file('OPS/chapter.xhtml', chapter.replace('</body>',
      '<a href="#nota-ausente">Nota</a></body>')); },
  },
  {
    id: '03-indice-seletivo-valido',
    absent: 'NAV_INVALID',
    mutate: (zip) => {
      zip.file('OPS/chapter2.xhtml', chapter.replace('Início', 'Apêndice'));
      zip.file('OPS/book.opf', opf.replace('</manifest>',
        '<item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/></manifest>')
        .replace('</spine>', '<itemref idref="ch2"/></spine>'));
    },
  },
  {
    id: '04-fonte-externa-https-legitima',
    absent: 'CSS_UNSAFE_RESOURCE',
    mutate: (zip) => { zip.file('OPS/style.css',
      '@font-face { font-family: L; src:url("https://example.org/legitimo.woff2") }'); },
  },
  {
    id: '05-script-xhtml',
    expected: 'CONTENT_SCRIPTED',
    mutate: (zip) => { zip.file('OPS/chapter.xhtml',
      chapter.replace('</body>', '<script>alert(1)</script></body>')); },
  },
  {
    id: '06-javascript-com-entidade',
    expected: 'CONTENT_UNSAFE_URL',
    mutate: (zip) => { zip.file('OPS/chapter.xhtml',
      chapter.replace('</body>', '<a href="java&#x73;cript:alert(1)">A</a></body>')); },
  },
  {
    id: '07-css-expression',
    expected: 'CSS_UNSAFE_RESOURCE',
    mutate: (zip) => { zip.file('OPS/style.css', 'p {width:expression(alert(1)); color:blue;}'); },
  },
  {
    id: '08-css-url-executavel',
    expected: 'CSS_UNSAFE_RESOURCE',
    mutate: (zip) => { zip.file('OPS/style.css', 'p {background:url("javascript:alert(1)");}'); },
  },
  {
    id: '09-svg-com-evento',
    expected: 'CONTENT_SCRIPTED',
    mutate: (zip) => {
      zip.file('OPS/image.svg', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
      zip.file('OPS/book.opf', opf.replace('</manifest>',
        '<item id="svg" href="image.svg" media-type="image/svg+xml"/></manifest>'));
    },
  },
  {
    id: '10-script-orfa-maquina',
    expected: 'PACKAGE_UNDECLARED_SCRIPT',
    mutate: (zip) => { zip.file('OPS/extra.mjs', 'export const label = "não executado";'); },
  },
  {
    id: '11-xhtml-orfa-ativo',
    expected: 'PACKAGE_UNDECLARED_ACTIVE_CONTENT',
    mutate: (zip) => { zip.file('OPS/extra.xhtml',
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><script>1</script></body></html>'); },
  },
  {
    id: '12-manifest-id-duplicado',
    expected: 'OPF_DUPLICATE_ID',
    mutate: (zip) => { zip.file('OPS/book.opf', opf.replace('</manifest>',
      '<item id="ch" href="outra.xhtml" media-type="application/xhtml+xml"/></manifest>')); },
  },
  {
    id: '13-imagem-referenciada-ausente',
    expected: 'CONTENT_MISSING_RESOURCE',
    mutate: (zip) => { zip.file('OPS/chapter.xhtml',
      chapter.replace('</body>', '<img src="nao-existe.png" alt="Ilustração"/></body>')); },
  },
  {
    id: '14-capa-guide-inexistente',
    expected: 'COVER_GUIDE_INVALID_TARGET',
    mutate: (zip) => { zip.file('OPS/book.opf', opf.replace('</spine>',
      '</spine><guide><reference type="cover" href="capa-inexistente.xhtml"/></guide>')); },
  },
  {
    id: '15-narracao-sincronizada-tempo-invertido',
    expected: 'MEDIA_OVERLAY_INVALID_TIMING',
    mutate: (zip) => {
      zip.file('OPS/book.opf', opf.replace('id="ch" href="chapter.xhtml"',
        'id="ch" media-overlay="sync" href="chapter.xhtml"').replace('</manifest>',
        '<item id="sync" href="sync.smil" media-type="application/smil+xml"/>' +
        '<item id="audio" href="audio.mp3" media-type="audio/mpeg"/></manifest>'));
      zip.file('OPS/sync.smil', '<smil xmlns="http://www.w3.org/ns/SMIL">' +
        '<body><par><text src="chapter.xhtml#inicio"/>' +
        '<audio src="audio.mp3" clipBegin="3s" clipEnd="1s"/></par></body></smil>');
      zip.file('OPS/audio.mp3', Uint8Array.of(0xff, 0xfb, 0x90));
    },
  },
  {
    id: '16-opf-entidade-externa',
    expected: 'OPF_INVALID_XML',
    mutate: (zip) => { zip.file('OPS/book.opf',
      '<!DOCTYPE package [<!ENTITY sinister "texto">]>' + opf); },
  },
  {
    id: '17-entidade-nbsp',
    expected: 'XHTML_NBSP_ENTITY',
    mutate: (zip) => { zip.file('OPS/chapter.xhtml',
      chapter.replace('texto original', 'texto&nbsp;original')); },
  },
  {
    id: '18-metadado-modified-invalido',
    expected: 'OPF_MODIFIED_INVALID',
    mutate: (zip) => { zip.file('OPS/book.opf',
      opf.replace('2026-11-05T12:00:00Z', 'novembro 2026')); },
  },
];

describe('E-086: corpus sintético de defeitos históricos do reparador', () => {
  for (const scenario of scenarios) {
    it(scenario.id, async () => {
      const bytes = await epubWith(scenario.mutate);
      const snapshot = new Uint8Array(bytes);
      const report = await inspectEpub(scenario.id + '.epub', bytes);
      const codes = report.issues.map((issue) => issue.code);
      if (scenario.expected) expect(codes, scenario.id).toContain(scenario.expected);
      if (scenario.absent) expect(codes, scenario.id).not.toContain(scenario.absent);
      expect(bytes, scenario.id + ' modificou a origem').toEqual(snapshot);
      if (scenario.expected === 'PACKAGE_UNDECLARED_ACTIVE_CONTENT' ||
          scenario.expected === 'PACKAGE_UNDECLARED_SCRIPT') {
        expect(hasManualReviewIssues(report)).toBe(true);
      }
    });
  }
  it('o corpus cobre no mínimo 18 categorias sem usar material autoral', () => {
    expect(scenarios).toHaveLength(18);
    expect(new Set(scenarios.map((entry) => entry.id)).size).toBe(scenarios.length);
    expect(new Set(scenarios.map((entry) => entry.expected).filter(Boolean)).size)
      .toBeGreaterThanOrEqual(14);
  });
});
