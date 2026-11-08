// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';
import { validateMediaOverlays } from '../src/epub/validation/validateMediaOverlays';

const encoder = new TextEncoder();
function fixture(smil: string, chapter = '<p id="p1">Texto</p>') {
  const path = 'OPS/sync.smil';
  const chapterPath = 'OPS/chapter.xhtml';
  const files = new Map([
    [path, { bytes: encoder.encode(smil) }],
    [chapterPath, { bytes: encoder.encode(
      `<html xmlns="http://www.w3.org/1999/xhtml"><body>${chapter}</body></html>`) }],
    ['OPS/audio.mp3', { bytes: new Uint8Array([1, 2, 3]) }],
  ]);
  const loaded = { files } as unknown as LoadedEpub;
  const item = (id: string, resolvedPath: string, mediaType: string) => ({
    id, href: resolvedPath.split('/').at(-1) ?? '', mediaType, resolvedPath,
    properties: [], pathSafe: true, exists: true,
  });
  const pkg = {
    opfPath: 'OPS/package.opf', opfDir: 'OPS', version: '3.3',
    metadata: {}, rootfileCount: 1,
    spine: [], manifest: [
      { ...item('chapter', chapterPath, 'application/xhtml+xml'), mediaOverlay: 'sync' },
      item('sync', path, 'application/smil+xml'),
      item('audio', 'OPS/audio.mp3', 'audio/mpeg'),
    ],
  } as PackageDocumentInfo;
  return { loaded, pkg };
}
function smil(par: string) {
  return `<smil xmlns="http://www.w3.org/ns/SMIL" version="3.0"><body>${par}</body></smil>`;
}
const par = '<par><text src="chapter.xhtml#p1"/>' +
  '<audio src="audio.mp3" clipBegin="1s" clipEnd="2.5s"/></par>';

describe('E-047: diagnóstico não destrutivo de media overlays SMIL', () => {
  it('aceita sincronização válida de texto, clipe e âncora, sem exigir mudança no arquivo', () => {
    const { loaded, pkg } = fixture(smil(par));
    expect(validateMediaOverlays(loaded, pkg)).toEqual([]);
  });

  it('detecta fragmento, áudio e tempo inválidos separadamente', () => {
    const { loaded, pkg } = fixture(smil(
      '<par><text src="chapter.xhtml#ausente"/>' +
      '<audio src="nao-existe.mp3" clipBegin="5s" clipEnd="1s"/></par>',
    ));
    const codes = validateMediaOverlays(loaded, pkg).map((issue) => issue.code);
    expect(codes).toContain('MEDIA_OVERLAY_MISSING_FRAGMENT');
    expect(codes).toContain('MEDIA_OVERLAY_MISSING_RESOURCE');
    expect(codes).toContain('MEDIA_OVERLAY_INVALID_TIMING');
  });

  it('rejeita script como src de áudio mas mantém HTTPS legítimo', () => {
    const bad = fixture(smil('<par><text src="chapter.xhtml#p1"/>' +
      '<audio src="javascript:alert(1)"/></par>'));
    expect(validateMediaOverlays(bad.loaded, bad.pkg).map((issue) => issue.code))
      .toContain('MEDIA_OVERLAY_INVALID_TARGET');
    const good = fixture(smil('<par><text src="chapter.xhtml#p1"/>' +
      '<audio src="https://example.org/narracao.mp3" clipBegin="0s" clipEnd="3s"/></par>'));
    expect(validateMediaOverlays(good.loaded, good.pkg)).toEqual([]);
  });

  it('sinaliza XML malformado e media-overlay apontando para item que não é SMIL', () => {
    const bad = fixture('<smil><body>');
    bad.pkg.manifest.find((item) => item.id === 'chapter')!.mediaOverlay = 'audio';
    const codes = validateMediaOverlays(bad.loaded, bad.pkg).map((issue) => issue.code);
    expect(codes).toContain('MEDIA_OVERLAY_INVALID_XML');
    expect(codes).toContain('MEDIA_OVERLAY_INVALID_TARGET');
  });
});
