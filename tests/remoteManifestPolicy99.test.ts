// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { validateRemoteManifestResources } from '../src/epub/validation/validateRemoteManifestResources';
import { validateManifestContentProperties } from '../src/epub/validation/validateManifestContentProperties';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

function item(id: string, href: string, mediaType: string, properties: string[] = []) {
  return { id, href, mediaType, properties, resolvedPath: href,
    exists: false, pathSafe: true, remote: true };
}
const version = (v: string, entries: ReturnType<typeof item>[]) =>
  ({ version: v, opfPath: 'OPS/book.opf', manifest: entries,
    spine: [], metadata: {}, rootfileCount: 1 }) as PackageDocumentInfo;
const codes = (pkg: PackageDocumentInfo) =>
  validateRemoteManifestResources(pkg).map((issue) => issue.code);

describe('E-045: publicação com recursos remotos legítimos por versão e MIME', () => {
  it('permite fontes HTTPS e áudio/vídeo externos em EPUB 3', () => {
    const p = version('3.3', [
      item('font','https://example.org/font.woff2','font/woff2'),
      item('audio','https://example.org/audio.mp3','audio/mpeg'),
      item('video','https://example.org/video.mp4','video/mp4'),
    ]);
    expect(codes(p)).toEqual([]);
  });
  it('distingue HTML, CSS e imagem remota em manifest de recurso permitido', () => {
    const p = version('3.3', [
      item('html','https://example.org/chapter.xhtml','application/xhtml+xml'),
      item('css','https://example.org/styles.css','text/css'),
      item('png','https://example.org/img.png','image/png'),
    ]);
    expect(codes(p).filter((code) => code === 'OPF_REMOTE_RESOURCE_UNSUPPORTED'))
      .toHaveLength(3);
  });
  it('EPUB 2 não tem as exceções de recursos remotos do EPUB 3', () => {
    const p = version('2.0', [
      item('audio','https://example.org/audio.mp3','audio/mpeg'),
    ]);
    expect(codes(p)).toContain('OPF_REMOTE_RESOURCE_UNSUPPORTED');
  });
  it('HTTP gera apenas recomendação informativa quando o formato é permitido', () => {
    const p = version('3.3', [
      item('font','http://example.org/legado.woff2','font/woff2'),
    ]);
    const issues = validateRemoteManifestResources(p);
    expect(issues.map((x) => x.code)).toEqual(['OPF_REMOTE_HTTP_TRANSPORT']);
    expect(issues[0]?.severity).toBe('info');
    expect(issues[0]?.repairable).toBe(false);
  });
  it('conteúdo XHTML que incorpora áudio remoto requer propriedade, não link externo', () => {
    const path = 'OPS/chapter.xhtml';
    const markup = '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
      '<a href="https://example.org">Referência editorial</a>' +
      '<audio src="https://example.org/audio.mp3"/></body></html>';
    const chapter = { ...item('chapter','chapter.xhtml','application/xhtml+xml'),
      resolvedPath: path, exists: true, remote: false };
    const pkg = version('3.3', [chapter]);
    const loaded = { files: new Map([[path, { bytes: new TextEncoder().encode(markup) }]]) } as unknown as LoadedEpub;
    expect(validateManifestContentProperties(loaded,pkg).map((i) => i.context))
      .toContain('remote-resources');
    chapter.properties.push('remote-resources');
    expect(validateManifestContentProperties(loaded,pkg)).toEqual([]);
  });
  it('um hiperlink externo isolado não exige propriedade remote-resources', () => {
    const path = 'OPS/chapter.xhtml';
    const markup = '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
      '<a href="https://example.org">Link</a></body></html>';
    const chapter = { ...item('chapter','chapter.xhtml','application/xhtml+xml'),
      resolvedPath:path, exists:true, remote:false };
    const pkg = version('3.3',[chapter]);
    const loaded = { files: new Map([[path,{bytes:new TextEncoder().encode(markup)}]]) } as unknown as LoadedEpub;
    expect(validateManifestContentProperties(loaded,pkg)).toEqual([]);
  });
});
