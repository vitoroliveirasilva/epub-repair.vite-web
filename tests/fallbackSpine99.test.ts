
import { describe, expect, it } from 'vitest';
import { validateManifestFallbacks } from '../src/epub/validation/validateManifestFallbacks';
import type { ManifestItem, PackageDocumentInfo } from '../src/epub/model/opfTypes';

function item(id: string, mediaType: string, fallback?: string): ManifestItem {
  return { id, href: id, resolvedPath: 'OPS/' + id, mediaType,
    properties: [], fallback, exists: true, pathSafe: true };
}
function validate(manifest: ManifestItem[], spine: string[] = [], version = '3.3') {
  const pkg = { manifest, spine: spine.map((idref) => ({ idref })),
    version, opfPath: 'OPS/book.opf' } as PackageDocumentInfo;
  return validateManifestFallbacks(pkg).map((issue) => issue.code);
}
describe('E-041/E-044: cadeias fallback EPUB3 e documentos estrangeiros no spine', () => {
  it('aceita XHTML e SVG no spine sem fallback', () => {
    expect(validate([item('a','application/xhtml+xml'),item('b','image/svg+xml')],
      ['a','b'])).toEqual([]);
  });
  it('exige documento de leitura para PNG, MP3 e PDF no spine', () => {
    const manifest = [
      item('png','image/png'), item('mp3','audio/mpeg'), item('pdf','application/pdf'),
    ];
    expect(validate(manifest,['png','mp3','pdf']).filter((c) =>
      c === 'OPF_SPINE_FOREIGN_FALLBACK_MISSING')).toHaveLength(3);
  });
  it('aceita cadeia PDF → PNG → XHTML e recurso não usado sem fallback', () => {
    const manifest = [
      item('pdf','application/pdf','png'), item('png','image/png','html'),
      item('html','application/xhtml+xml'),item('supplement','application/pdf'),
    ];
    expect(validate(manifest,['pdf'])).toEqual([]);
  });
  it('não aceita XHTML remoto como destino editorial de fallback do spine', () => {
    const pdf = item('pdf','application/pdf','online');
    const remote = { ...item('online','application/xhtml+xml'),
      href:'https://example.org/chapter.xhtml', resolvedPath:'https://example.org/chapter.xhtml',
      remote:true, exists:false };
    expect(validate([pdf,remote],['pdf'])).toContain(
      'OPF_SPINE_FOREIGN_FALLBACK_MISSING');
  });
  it('não marca fallback de PDF para PNG como documento de leitura no spine', () => {
    const manifest = [item('pdf','application/pdf','png'),item('png','image/png')];
    expect(validate(manifest,['pdf'])).toContain('OPF_SPINE_FOREIGN_FALLBACK_MISSING');
  });
  it('diagnostica fallback estrangeiro que não chega a recurso core', () => {
    const manifest = [
      item('pdf','application/pdf','binary'),
      item('binary','application/octet-stream'),
    ];
    expect(validate(manifest)).toContain('OPF_FALLBACK_INVALID_TERMINAL');
  });
  it('não duplica diagnóstico de fallback inexistente ou circular já verificado no OPF', () => {
    expect(validate([item('a','application/pdf','missing')],['a'])).toEqual([]);
    expect(validate([item('a','application/pdf','b'),
      item('b','application/pdf','a')],['a'])).toEqual([]);
  });
  it('não impõe regras EPUB3 de spine a EPUB2', () => {
    expect(validate([item('pdf','application/pdf')], ['pdf'], '2.0')).toEqual([]);
  });
  it('fontes e JS no manifest sem renderização direta não exigem fallback', () => {
    expect(validate([item('font','font/woff2'),item('script','text/javascript'),
      item('appendix','application/pdf')])).toEqual([]);
  });
});
