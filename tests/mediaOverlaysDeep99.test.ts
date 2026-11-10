
import { describe, expect, it } from 'vitest';
import { validateMediaOverlays } from '../src/epub/validation/validateMediaOverlays';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const xml = (body: string) =>
  '<smil xmlns="http://www.w3.org/ns/SMIL" version="3.0"><body>' + body + '</body></smil>';
const audio = '<audio src="audio.mp3" clipBegin="0.3s" clipEnd="3.5s"/>';
const text = '<text src="chapter.xhtml#one"/>';
function check(smil: string, options?: { audioMime?: string; textMime?: string; ids?: string }) {
  const bytes = new TextEncoder();
  const files = new Map([
    ['OPS/sync.smil', { bytes: bytes.encode(smil) }],
    ['OPS/chapter.xhtml', { bytes: bytes.encode(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><p id="one">Um</p></body></html>') }],
    ['OPS/audio.mp3', { bytes: Uint8Array.of(0x49,0x44,0x33,3) }],
  ]);
  const mk = (id: string, path: string, mediaType: string) => ({
    id, href: path.slice(4), resolvedPath:path, mediaType, exists:true,
    pathSafe:true, properties:[],
  });
  const pkg = { version:'3.3', opfPath:'OPS/book.opf', opfDir:'OPS',
    manifest:[
      { ...mk('chapter','OPS/chapter.xhtml',options?.textMime ?? 'application/xhtml+xml'),
        mediaOverlay:'smil' },
      mk('smil','OPS/sync.smil','application/smil+xml'),
      mk('audio','OPS/audio.mp3',options?.audioMime ?? 'audio/mpeg'),
    ], spine:[], metadata:{}, rootfileCount:1,
  } as PackageDocumentInfo;
  const loaded = { files } as unknown as LoadedEpub;
  return validateMediaOverlays(loaded, pkg).map((i) => i.code);
}
describe('E-047: relações e namespaces de Media Overlays', () => {
  it('aceita sequência SMIL com vários clips e identificadores únicos', () => {
    const first = '<par id="p1">' + text + audio + '</par>';
    const next = '<par id="p2"><text src="chapter.xhtml#one"/>' +
      '<audio src="audio.mp3" clipBegin="3.5s" clipEnd="7s"/></par>';
    expect(check(xml('<seq id="seq">' + first + next + '</seq>'))).toEqual([]);
  });
  it('não aceita <fake:par> como elemento SMIL válido', () => {
    const fake = '<foreign:par xmlns:foreign="urn:foreign">' + text + audio +
      '</foreign:par>';
    expect(check(xml(fake))).toContain('MEDIA_OVERLAY_INVALID_STRUCTURE');
  });
  it('detecta IDs duplicados sem tocar arquivos originais', () => {
    const parts = '<par id="duplicate">' + text + audio + '</par>' +
      '<par id="duplicate">' + text + audio + '</par>';
    expect(check(xml(parts))).toContain('MEDIA_OVERLAY_DUPLICATE_ID');
  });
  it('rejeita áudio existente não declarado como áudio no manifest', () => {
    expect(check(xml('<par>' + text + audio + '</par>'), { audioMime:'application/pdf' }))
      .toContain('MEDIA_OVERLAY_INVALID_TARGET');
  });
  it('rejeita texto sincronizado existente mas com MIME incorreto', () => {
    expect(check(xml('<par>' + text + audio + '</par>'), { textMime:'application/pdf' }))
      .toContain('MEDIA_OVERLAY_INVALID_TARGET');
  });
  it('rejeita clipEnd infinito e segundos malformados', () => {
    const bad = '<par>' + text + '<audio src="audio.mp3" clipBegin="0s" ' +
      'clipEnd="9999999999999999999999999999999999999999999999999999999s"/></par>';
    
    
    expect(check(xml(bad)).every((code) => code !== 'MEDIA_OVERLAY_INVALID_XML')).toBe(true);
    expect(check(xml('<par>' + text +
      '<audio src="audio.mp3" clipBegin="abc" clipEnd="2s"/></par>')))
      .toContain('MEDIA_OVERLAY_INVALID_TIMING');
  });
});
