// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { auditPreservation } from '../src/epub/repair/preservationAudit';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

function compare(before: string, after: string) {
  const path='OPS/chapter.xhtml';
  const wrap=(body:string)=>'<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
    body + '</body></html>';
  const entry={id:'c',href:'chapter.xhtml',mediaType:'application/xhtml+xml',
    properties:[],exists:true,pathSafe:true,resolvedPath:path};
  const pkg={opfPath:'OPS/book.opf',opfDir:'OPS',version:'3.3',
    metadata:{},manifest:[entry],spine:[{idref:'c',manifestItem:entry}],
    rootfileCount:1} as PackageDocumentInfo;
  const original={files:new Map([[path,{bytes:new TextEncoder().encode(wrap(before))}]])}
    as unknown as LoadedEpub;
  const output=new Map([[path,new TextEncoder().encode(wrap(after))]]);
  return ()=>auditPreservation(original,output,pkg,pkg);
}
describe('E-074: não reescrever ênfase, poesia, tipografia e diagramação autoral', () => {
  it('impede perder itálico e negrito embora o texto visível continue igual', () => {
    expect(compare('<p>Ele disse <em>não</em> e <strong>acabou</strong>.</p>',
      '<p>Ele disse não e acabou.</p>')).toThrow(/formatação/u);
  });
  it('impede eliminar quebras br explícitas de poesia e diálogos', () => {
    expect(compare('<p>Primeiro verso<br/>Segundo verso</p>',
      '<p>Primeiro verso Segundo verso</p>')).toThrow(/quebra de verso/u);
  });
  it('impede alterar classe editorial ou CSS inline passivo de span', () => {
    const before='<p><span class="verso" style="font-style:italic">Frase.</span></p>';
    expect(compare(before,
      '<p><span class="verso">Frase.</span></p>')).toThrow(/formatação/u);
    expect(compare(before,
      '<p><span class="prosa" style="font-style:italic">Frase.</span></p>'))
      .toThrow(/formatação/u);
  });
  it('preserva espaços intencionais em pre/code', () => {
    expect(compare('<pre>linha  1\n  linha  2</pre>',
      '<pre>linha 1\n linha 2</pre>')).toThrow(/espaçamento/u);
  });
  it('permite neutralizar JavaScript sem alterar tipografia editorial', () => {
    const before='<p>Leia <em>com calma</em>.</p><script>alert(1)</script>';
    const after='<p>Leia <em>com calma</em>.</p>';
    expect(compare(before,after)).not.toThrow();
  });
  it('preserva travessões e pontuação Unicode em diálogos', () => {
    const phrase='<p>— “Eu vou”, disse ela. Depois: — “Talvez…”</p>';
    expect(compare(phrase,phrase+'<!-- nota do conversor -->')).not.toThrow();
  });
});
