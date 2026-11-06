// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractCssResourceReferences } from '../src/epub/validation/referenceExtractor';
import { coverReferenceScope } from '../src/epub/cover/coverReferenceScope';
import { sanitizeHtmlDocument } from '../src/epub/sanitize/sanitizeHtml';
import { assertNoNewCriticalIssues } from '../src/epub/repair/repairSafety';
import { buildValidationReport } from '../src/epub/utils/reportBuilder';
import { createIssue } from '../src/epub/utils/issueFactory';
import { guessOpfPath } from '../src/epub/validation/opfParser';
import { validateInternalAnchors } from '../src/epub/validation/validateInternalAnchors';
import { auditPreservation } from '../src/epub/repair/preservationAudit';
import { validateManifestFallbacks } from '../src/epub/validation/validateManifestFallbacks';
import { repairOptionalXhtmlLanguage } from '../src/epub/repair/repairKindleCompatibility';
import { validateManifestContentProperties } from '../src/epub/validation/validateManifestContentProperties';
import { canRepairReport } from '../src/epub/utils/reportGuards';
import { validateImageMetadata } from '../src/epub/validation/validateImageMetadata';
import { validateKindleCompatibility } from '../src/epub/validation/validateKindleCompatibility';
import { validateImageResources } from '../src/epub/validation/validateImageResources';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const enc=new TextEncoder();
const resource=(path:string,content:string|Uint8Array)=>({
  path,bytes:typeof content==='string'?enc.encode(content):content,directory:false,
});
const item=(id:string,path:string,mediaType:string)=>({
  id,href:path,resolvedPath:path,mediaType,exists:true,pathSafe:true,properties:[],
});
const fakeLoaded=(files:Map<string,unknown>)=>({files}) as unknown as LoadedEpub;
const fakePkg=(manifest:unknown[],spine:unknown[]=[])=>
  ({version:'3.3',opfPath:'OPS/package.opf',opfDir:'OPS',metadata:{language:'pt-BR'},
    manifest,spine,rootfileCount:1}) as PackageDocumentInfo;
const issue=(detail:string)=>createIssue({
  code:'CONTENT_MISSING_RESOURCE',severity:'warning',title:'Recurso ausente',
  detail,context:'src',file:'OPS/chapter.xhtml',repairable:true,
});
const report=(issues:ReturnType<typeof issue>[])=>buildValidationReport({
  fileName:'example.epub',fileSize:100,validZip:true,zipEntries:[],issues,
});
const sanitizeOpts={
  filePath:'OPS/one.xhtml',existingFiles:new Set(['OPS/one.xhtml']),
  sanitizeScripts:true,removeRemoteResourceLinks:false,kindleSafeMode:false,
};

describe('Auditoria E-132 a E-139: CSS, conteúdo e segurança',()=>{
  it('E-132: classifica @import url() sem aspas como import e não como imagem',()=>{
    const refs=extractCssResourceReferences('@import url(nested.css); body{background:url(a.png)}');
    expect(refs.filter(x=>x.value==='nested.css').map(x=>x.attr)).toEqual(['css:import']);
    expect(refs.map(x=>x.value)).toContain('a.png');
  });
  it('E-133: identifica página 0001.xhtml de capa com style interno',()=>{
    const first='OPS/Text/0001.xhtml';
    const cover='OPS/Images/old.png';
    const doc=new DOMParser().parseFromString('<package/>','application/xml');
    const html='<html xmlns="http://www.w3.org/1999/xhtml"><head><style>'+
      'body{background:url("../Images/old.png")}</style></head><body><div/></body></html>';
    const chapter=item('c',first,'application/xhtml+xml');
    const pkg=fakePkg([chapter,item('old',cover,'image/png')],
      [{idref:'c',manifestItem:chapter}]);
    const scope=coverReferenceScope(doc,pkg,new Map([[first,enc.encode(html)]]),cover);
    expect(scope.pages.has(first)).toBe(true);
  });
  it('E-134: preserva texto literal em CDATA, sem remover script citado',()=>{
    const raw='<html xmlns="http://www.w3.org/1999/xhtml"><body>'+
      '<pre><![CDATA[<script>trecho de documentação</script>]]></pre></body></html>';
    expect(sanitizeHtmlDocument(raw,sanitizeOpts).text).toBe(raw);
  });
  it('E-135: reconhece capa via CSS escapado como recurso compartilhado',()=>{
    const css='OPS/Styles/shared.css';
    const first='OPS/Text/0001.xhtml';
    const chapter='OPS/Text/chapter.xhtml';
    const xhtml='<html xmlns="http://www.w3.org/1999/xhtml"><head>'+
      '<link rel="stylesheet" href="../Styles/shared.css"/></head><body/></html>';
    const cssSource='.c{background-image:url("../Images/ol\\64.png")}';
    const firstItem=item('c',first,'application/xhtml+xml');
    const pkg=fakePkg([
      firstItem,item('other',chapter,'application/xhtml+xml'),item('css',css,'text/css'),
      item('cover','OPS/Images/old.png','image/png'),
    ],[{idref:'c',manifestItem:firstItem}]);
    const scope=coverReferenceScope(new DOMParser().parseFromString('<package/>','application/xml'),
      pkg,new Map([[first,enc.encode(xhtml)],[chapter,enc.encode(xhtml)],
        [css,enc.encode(cssSource)]]),'OPS/Images/old.png');
    expect(scope.pages.has(first)).toBe(true);
    expect(scope.sharedStyles.has(css)).toBe(true);
  });
  it('E-136: remoção opt-in de hyperlink conserva ênfase e entidades',()=>{
    const input='<html xmlns="http://www.w3.org/1999/xhtml"><body><p>'+
      '<a href="https://example.org">Olá <em>mundo</em> &amp; Cia</a>'+
      '</p></body></html>';
    const result=sanitizeHtmlDocument(input,{...sanitizeOpts,removeRemoteResourceLinks:true});
    expect(result.text).toContain('Olá <em>mundo</em> &amp; Cia');
    expect(result.text).not.toContain('href="https://example.org"');
    expect(result.text).not.toContain('&amp;amp;');
  });
  it('E-138: falha se um segundo recurso ausente tem mesmo código e contexto',()=>{
    const before=report([issue('ausente-1.png')]);
    const after=report([issue('ausente-1.png'),issue('ausente-2.png')]);
    expect(()=>assertNoNewCriticalIssues(before,after)).toThrow(/novos erros|avisos/iu);
  });
});
describe('Auditoria E-140 a E-149: parsing e compatibilidade',()=>{
  it('E-140: resolve OPF pelo nome físico com capitalização original',()=>{
    expect(guessOpfPath(['OEBPS/Content.OPF'])).toBe('OEBPS/Content.OPF');
  });
  it('E-141: valida fragmentos em HTML não XML',()=>{
    const a='OPS/chap.html', b='OPS/note.html';
    const files=new Map<string,unknown>([
      [a,resource(a,'<!doctype html><html><body><a href="note.html#missing">Nota</a>')],
      [b,resource(b,'<!doctype html><html><body><img src="x.png"><p id="present">Texto</p>')],
    ]);
    const pkg=fakePkg([item('a',a,'text/html'),item('b',b,'text/html')]);
    expect(validateInternalAnchors(fakeLoaded(files),pkg).some(x=>
      x.code==='CONTENT_MISSING_FRAGMENT')).toBe(true);
  });
  it('E-142: recusa perda de texto DTBook em pagenum e verso',()=>{
    const path='OPS/book.dtbook';
    const pkgItem=item('book',path,'application/x-dtbook+xml');
    const pkg=fakePkg([pkgItem],[{idref:'book',manifestItem:pkgItem}]);
    const original='<dtbook><book><bodymatter><poem><line>Verso intacto</line>'+
      '</poem><pagenum>42</pagenum></bodymatter></book></dtbook>';
    const modified=original.replace('Verso intacto','');
    const files=new Map([[path,resource(path,original)]]);
    expect(()=>auditPreservation(fakeLoaded(files),new Map([[path,enc.encode(modified)]]),
      pkg,pkg)).toThrow(/DTBook/u);
  });
  it('E-143: cadeia fallback não aceita core intermediário com terminal proprietário',()=>{
    const pdf={...item('pdf','OPS/a.pdf','application/pdf'),fallback:'image'};
    const image={...item('image','OPS/a.jpg','image/jpeg'),fallback:'custom'};
    const proprietary=item('custom','OPS/custom.bin','application/octet-stream');
    expect(validateManifestFallbacks(fakePkg([pdf,image,proprietary])).some(x=>
      x.code==='OPF_FALLBACK_INVALID_TERMINAL')).toBe(true);
  });
  it('E-144: normaliza idioma XHTML em operação isolada sem reescrever prosa',()=>{
    const path='OPS/ch.xhtml';
    const original='<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Leia-me</p></body></html>';
    const files=new Map([[path,enc.encode(original)]]);
    const actions=repairOptionalXhtmlLanguage(files,fakePkg([item('ch',path,'application/xhtml+xml')]));
    expect(actions).toHaveLength(1);
    expect(new TextDecoder().decode(files.get(path))).toContain('xml:lang="pt-BR"');
    expect(new TextDecoder().decode(files.get(path))).toContain('<p>Leia-me</p>');
  });
  it('E-145: propriedades exigidas e inferidas podem ser reparadas',()=>{
    const path='OPS/math.xhtml';
    const xml='<html xmlns="http://www.w3.org/1999/xhtml"><body>'+
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math></body></html>';
    const loaded=fakeLoaded(new Map([[path,resource(path,xml)]]));
    const issues=validateManifestContentProperties(loaded,
      fakePkg([item('math',path,'application/xhtml+xml')]));
    expect(issues.some(x=>x.code==='OPF_MANIFEST_PROPERTY_MISSING'&&x.repairable)).toBe(true);
  });
  it('E-146: substituição de img ausente só vira reparo após opt-in',()=>{
    const missing=createIssue({code:'CONTENT_MISSING_RESOURCE',severity:'warning',
      title:'Imagem ausente',detail:'Somente opt-in',file:'OPS/one.xhtml',
      context:'img:src',repairable:false});
    const rpt=report([missing]);
    expect(canRepairReport(rpt)).toBe(false);
    expect(canRepairReport(rpt,{replaceMissingImagesWithText:true})).toBe(true);
  });
  it('E-147: identifica EXIF em JPEG alias e zTXt PNG sem reescrever bytes',()=>{
    const jpg='OPS/photo.jpg';
    const exif=Uint8Array.of(255,216,255,225,0,8,69,120,105,102,0,0,255,217);
    const jpgIssues=validateImageMetadata(fakeLoaded(new Map([[jpg,resource(jpg,exif)]])),
      fakePkg([item('jpg',jpg,'image/jpg')]));
    expect(jpgIssues.some(x=>x.code==='IMAGE_EMBEDDED_METADATA')).toBe(true);
    const png='OPS/photo.png';
    const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,25,122,84,88,116,
      ...new TextEncoder().encode('XML:com.adobe.xmp'),0,0,0,0,0,0,0,0,0,0]);
    const pngIssues=validateImageMetadata(fakeLoaded(new Map([[png,resource(png,bytes)]])),
      fakePkg([item('png',png,'image/png')]));
    expect(pngIssues.some(x=>x.code==='IMAGE_EMBEDDED_METADATA')).toBe(true);
  });
  it('E-148: playOrder numérico com lixo após valor é diagnosticado',()=>{
    const path='OPS/toc.ncx';
    const ncx='<ncx><navMap><navPoint playOrder="1x"><content src="ch.xhtml"/>'+
      '</navPoint></navMap></ncx>';
    const pkg=fakePkg([item('toc',path,'application/x-dtbncx+xml')]);
    pkg.ncxItem=pkg.manifest[0];
    const issues=validateKindleCompatibility(fakeLoaded(new Map([[path,resource(path,ncx)]])),pkg);
    expect(issues.some(x=>x.code==='NCX_PLAYORDER_OUT_OF_ORDER')).toBe(true);
  });
  it('E-149: JPEG com largura zero recebe alerta de dimensões',()=>{
    const path='OPS/photo.jpg';
    const invalid=Uint8Array.of(255,216,255,192,0,17,8,0,5,0,0,3,
      1,17,0,2,17,1,3,17,1,255,217);
    const issues=validateImageResources(fakeLoaded(new Map([[path,resource(path,invalid)]])),
      fakePkg([item('jpeg',path,'image/jpeg')]));
    expect(issues.some(x=>x.code==='IMAGE_INVALID_DIMENSIONS')).toBe(true);
  });
});
