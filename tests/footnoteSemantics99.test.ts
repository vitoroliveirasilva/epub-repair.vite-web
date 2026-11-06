// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { validateFootnotes } from '../src/epub/validation/validateFootnotes';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const wrap = (body: string) =>
  '<html xmlns="http://www.w3.org/1999/xhtml" ' +
  'xmlns:epub="http://www.idpf.org/2007/ops"><body>' + body + '</body></html>';
const noteRef = '<a id="ref1" epub:type="noteref" href="notes.xhtml#n1">[1]</a>';
const note = '<aside id="n1" epub:type="footnote"><p>Nota original.</p>' +
  '<a epub:type="backlink" href="chapter.xhtml#ref1">Voltar</a></aside>';
function inspect(chapter = noteRef, notes = note) {
  const pages = new Map([
    ['OPS/chapter.xhtml', wrap('<p>Capítulo com nota' + chapter + '</p>')],
    ['OPS/notes.xhtml', wrap(notes)],
  ]);
  const files = new Map(Array.from(pages, ([path, markup]) =>
    [path, { bytes: new TextEncoder().encode(markup) }]));
  const loaded = { files } as unknown as LoadedEpub;
  const manifest = Array.from(pages.keys(), (path, index) => ({
    id: 'page-' + index, href: path.split('/').at(-1) ?? '', resolvedPath: path,
    mediaType: 'application/xhtml+xml', properties: [], pathSafe: true, exists: true,
  }));
  const pkg = { manifest } as unknown as PackageDocumentInfo;
  return validateFootnotes(loaded, pkg);
}
describe('E-071: notas e backlinks editoriais não destrutivos', () => {
  it('aceita noteref EPUB3, aside footnote e backlink no documento de origem', () => {
    expect(inspect()).toEqual([]);
  });
  it('não exige backlink para nota que tem apenas remissão de ida', () => {
    expect(inspect(noteRef,'<aside id="n1" epub:type="footnote"><p>Nota.</p></aside>'))
      .toEqual([]);
  });
  it('aceita nota de fim em lista declarada com epub:type endnotes', () => {
    expect(inspect(noteRef, '<section epub:type="endnotes">' +
      '<ol><li id="n1">Nota final</li></ol></section>')).toEqual([]);
  });
  it('detecta noteref que aponta para ID inexistente', () => {
    expect(inspect(noteRef.replace('#n1','#ausente')).map((i) => i.code))
      .toContain('CONTENT_FOOTNOTE_INVALID_TARGET');
  });
  it('detecta backlink quebrado sem inventar id de retorno', () => {
    expect(inspect(noteRef, note.replace('#ref1','#nao-existe')).map((i) => i.code))
      .toContain('CONTENT_FOOTNOTE_BACKLINK_INVALID');
  });
  it('detecta backlink a um heading que não é noteref', () => {
    const chapter = '<h2 id="titulo">Título</h2>' + noteRef;
    const notes = note.replace('#ref1','#titulo');
    expect(inspect(chapter,notes).map((i) => i.code))
      .toContain('CONTENT_FOOTNOTE_BACKLINK_INVALID');
  });
  it('noteref externo não é tratado como referência interna', () => {
    expect(inspect(noteRef.replace('notes.xhtml#n1','https://example.org/notas#n1'))
      .map((i) => i.code)).toContain('CONTENT_FOOTNOTE_INVALID_TARGET');
  });
  it('nota sem epub:type gera informação, não mudança automática de texto', () => {
    const issues = inspect(noteRef, '<p id="n1">Nota sem marcação.</p>');
    expect(issues.map((i) => i.code)).toContain('CONTENT_FOOTNOTE_SEMANTICS_MISSING');
    expect(issues.every((i) => i.repairable === false)).toBe(true);
  });
  it('texto editorial com palavra "noteref" não é uma remissão real', () => {
    expect(inspect('<p>Exemplo: &lt;a epub:type="noteref"&gt;</p>',
      '<p id="n1">Nota normal</p>')).toEqual([]);
  });
});
