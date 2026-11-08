// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeCssDocument } from '../src/epub/sanitize/sanitizeCss';
import { containsDangerousCss } from '../src/epub/sanitize/sanitizeActiveContent';
import { extractCssResourceReferences, extractDocumentResourceReferences } from '../src/epub/validation/referenceExtractor';
import { sanitizeHtmlDocument } from '../src/epub/sanitize/sanitizeHtml';
import { buildCoverReportInfo } from '../src/epub/utils/kindleCompatibility';
import { validateCoverConsistency } from '../src/epub/validation/validateCoverConsistency';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';
import type { LoadedEpub } from '../src/epub/model/epubTypes';

describe('E-114: strings CSS são conteúdo editorial, não recursos', () => {
  it('ignora url() literal em content sem gerar falsa ameaça nem alterar texto', () => {
    const css = '.quote:after{content:"url(imagem-ausente.png)"}';
    const result = sanitizeCssDocument('OPS/s.css', css, new Set(['OPS/s.css']));
    expect(result.changed).toBe(false);
    expect(result.text).toBe(css);
    expect(extractCssResourceReferences(css)).toHaveLength(0);
  });
  it('ignora JavaScript citado como texto CSS, mas continua bloqueando URL real', () => {
    const quote = '.code:after{content:"url(javascript:alert(1))"}';
    expect(containsDangerousCss(quote)).toBe(false);
    expect(sanitizeCssDocument('OPS/s.css', quote, new Set(['OPS/s.css'])).text).toBe(quote);
    const real = '.bad{background:url("javascript:alert(1)")}.ok{color:red}';
    expect(containsDangerousCss(real)).toBe(true);
    const changed = sanitizeCssDocument('OPS/s.css', real, new Set(['OPS/s.css']));
    expect(changed.text).not.toContain('javascript:');
    expect(changed.text).toContain('.ok{color:red}');
  });
});

describe('E-115: capa declarada não pode ser documento XHTML', () => {
  it('avisa e não classifica XHTML como imagem de capa declarada', () => {
    const opf = 'OPS/book.opf';
    const page = 'OPS/title.xhtml';
    const manifestItem = {
      id:'wrong-cover',href:'title.xhtml',resolvedPath:page,exists:true,
      mediaType:'application/xhtml+xml',pathSafe:true,properties:[],
    };
    const pkg = {
      opfPath:opf,opfDir:'OPS',version:'3.0',
      manifest:[manifestItem],spine:[],coverItem:manifestItem,
      coverMetaDeclared:true,coverMetaId:'wrong-cover',
    } as unknown as PackageDocumentInfo;
    const files = new Map([
      [opf,{path:opf,directory:false,bytes:new TextEncoder().encode(
        '<package xmlns="http://www.idpf.org/2007/opf"><metadata>' +
        '<meta name="cover" content="wrong-cover"/></metadata></package>')}],
      [page,{path:page,directory:false,bytes:new TextEncoder().encode(
        '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Rosto</p></body></html>')}],
    ]);
    const issues = validateCoverConsistency({files} as unknown as LoadedEpub,pkg);
    expect(issues.map(x=>x.code)).toContain('COVER_DECLARATIONS_CONFLICT');
    expect(buildCoverReportInfo(pkg,files).declared).toBe(false);
  });
});

describe('E-120: Kindle embed no texto não autoriza apagar prosa', () => {
  it('preserva exemplos literais em p, code e comentário', () => {
    const raw = '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
      '<!-- kindle:embed:99 --><p>Exemplo kindle:embed:42</p>' +
      '<code>kindle:embed:77</code></body></html>';
    const result = sanitizeHtmlDocument(raw,{
      filePath:'OPS/ch.xhtml',existingFiles:new Set(['OPS/ch.xhtml']),
      sanitizeScripts:true,removeRemoteResourceLinks:false,kindleSafeMode:true,
    });
    expect(result.text).toContain('<p>Exemplo kindle:embed:42</p>');
    expect(result.text).toContain('<code>kindle:embed:77</code>');
    expect(result.text).toContain('<!-- kindle:embed:99 -->');
    const doc = new DOMParser().parseFromString(raw,'application/xhtml+xml');
    const refs = extractDocumentResourceReferences(doc).filter(x=>x.attr==='kindle:embed');
    expect(refs.map(x=>x.raw)).toEqual(['kindle:embed:42']);
    expect(refs[0]?.kindleText).toBe(true);
  });
});
