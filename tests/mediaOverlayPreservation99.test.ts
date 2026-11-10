
import { describe, expect, it } from 'vitest';
import { auditPreservation } from '../src/epub/repair/preservationAudit';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const path='OPS/chapter.xhtml';
const smilPath='OPS/track.smil';
const content='<html xmlns="http://www.w3.org/1999/xhtml"><body><p id="first">Texto</p></body></html>';
const sync='<smil xmlns="http://www.w3.org/ns/SMIL"><body><par>' +
  '<text src="chapter.xhtml#first"/><audio src="voice.mp3" ' +
  'clipBegin="0s" clipEnd="2s"/></par></body></smil>';
const encode=(text:string)=>new TextEncoder().encode(text);
function fixture() {
  const chapter = { id:'chapter',href:'chapter.xhtml', resolvedPath:path,
    exists:true, mediaType:'application/xhtml+xml', mediaOverlay:'track',
    properties:[],pathSafe:true };
  const track = { id:'track',href:'track.smil',resolvedPath:smilPath,exists:true,
    mediaType:'application/smil+xml', properties:[],pathSafe:true };
  const pkg = { opfPath:'OPS/book.opf',opfDir:'OPS',version:'3.3',
    metadata:{},manifest:[chapter,track],
    spine:[{idref:'chapter',manifestItem:chapter}],rootfileCount:1 } as PackageDocumentInfo;
  const files = new Map([
    [path, { bytes:encode(content) }],
    [smilPath,{ bytes:encode(sync) }],
  ]);
  const loaded = { files } as unknown as LoadedEpub;
  const output = new Map([[path,encode(content)],[smilPath,encode(sync)]]);
  return { pkg, loaded, output };
}
describe('E-047: travar perda de sincronização durante reparo técnico', () => {
  it('passa quando SMIL e vínculo media-overlay não mudaram', () => {
    const x=fixture();
    expect(()=>auditPreservation(x.loaded,x.output,x.pkg,x.pkg)).not.toThrow();
  });
  it('recusa substituir SMIL de origem por clipe alterado', () => {
    const x=fixture();
    x.output.set(smilPath,encode(sync.replace('2s','3s')));
    expect(()=>auditPreservation(x.loaded,x.output,x.pkg,x.pkg))
      .toThrow(/sincronização SMIL/u);
  });
  it('recusa perder media-overlay ao regravar OPF', () => {
    const x=fixture();
    const after={...x.pkg,manifest:x.pkg.manifest.map(i=>
      i.id==='chapter'?{...i,mediaOverlay:undefined}:i)};
    expect(()=>auditPreservation(x.loaded,x.output,x.pkg,after))
      .toThrow(/vínculo editorial/u);
  });
  it('recusa remover SMIL declarado sem alterar outras páginas', () => {
    const x=fixture();
    x.output.delete(smilPath);
    expect(()=>auditPreservation(x.loaded,x.output,x.pkg,x.pkg))
      .toThrow(/sincronização SMIL/u);
  });
});
