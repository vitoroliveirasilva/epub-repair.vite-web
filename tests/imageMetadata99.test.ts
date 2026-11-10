
import { describe, expect, it } from 'vitest';
import { validateImageMetadata } from '../src/epub/validation/validateImageMetadata';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const concat = (...arrays: Uint8Array[]) => Uint8Array.from(arrays.flatMap(
  (array) => Array.from(array)));
const ascii = (s:string)=>new TextEncoder().encode(s);
function check(mime:string,bytes:Uint8Array) {
  const path='OPS/image.bin';
  const before=new Uint8Array(bytes);
  const loaded={files:new Map([[path,{bytes}]])} as unknown as LoadedEpub;
  const pkg={manifest:[{id:'image',resolvedPath:path,exists:true,mediaType:mime}]} as unknown as PackageDocumentInfo;
  const issues=validateImageMetadata(loaded,pkg);
  expect(Array.from(bytes)).toEqual(Array.from(before));
  return issues;
}
describe('E-075: inventário opt-in futuro EXIF/XMP/Photoshop, sem editar pixels', () => {
  it('detecta APP1 EXIF em JPEG preservando o bytes original', () => {
    const jpeg=Uint8Array.of(0xff,0xd8,0xff,0xe1,0,8,69,120,105,102,0,0,0xff,0xd9);
    const issues=check('image/jpeg',jpeg);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.context).toBe('EXIF');
    expect(issues[0]?.repairable).toBe(false);
  });
  it('detecta APP1 XMP sem confundir tags editoriais de outras seções', () => {
    const marker=ascii('http://ns.adobe.com/xap/1.0/\0');
    const len=marker.length+2;
    const jpeg=concat(Uint8Array.of(0xff,0xd8,0xff,0xe1,len>>8,len&255),marker,
      Uint8Array.of(0xff,0xd9));
    expect(check('image/jpeg',jpeg)[0]?.context).toBe('XMP');
  });
  it('detecta APP13 Photoshop de imagem JPEG', () => {
    const marker=ascii('Photoshop 3.0\0');
    const len=marker.length+2;
    const jpeg=concat(Uint8Array.of(0xff,0xd8,0xff,0xed,len>>8,len&255),marker,
      Uint8Array.of(0xff,0xd9));
    expect(check('image/jpeg',jpeg)[0]?.context).toBe('Photoshop');
  });
  it('não confunde perfil ICC com EXIF nem remove o perfil de cor', () => {
    const marker=ascii('ICC_PROFILE\0');
    const len=marker.length+2;
    const jpeg=concat(Uint8Array.of(0xff,0xd8,0xff,0xe2,len>>8,len&255),marker,
      Uint8Array.of(0xff,0xd9));
    expect(check('image/jpeg',jpeg)).toEqual([]);
  });
  it('detecta chunk eXIf PNG sem tocar em chunks ou CRCs', () => {
    const png=concat(Uint8Array.of(137,80,78,71,13,10,26,10),
      Uint8Array.of(0,0,0,4),ascii('eXIf'),Uint8Array.of(73,73,42,0),
      Uint8Array.of(0,0,0,0));
    expect(check('image/png',png)[0]?.context).toBe('EXIF');
  });
  it('detecta chunk EXIF WebP com alinhamento RIFF', () => {
    const webp=concat(ascii('RIFF'),Uint8Array.of(18,0,0,0),ascii('WEBP'),
      ascii('EXIF'),Uint8Array.of(6,0,0,0),Uint8Array.of(73,73,42,0,0,0));
    expect(check('image/webp',webp)[0]?.context).toBe('EXIF');
  });
  it('não marca PNG comum nem GIF por metadados inexistentes', () => {
    expect(check('image/png',Uint8Array.of(137,80,78,71,13,10,26,10))).toEqual([]);
    expect(check('image/gif',ascii('GIF89a'))).toEqual([]);
  });
});
