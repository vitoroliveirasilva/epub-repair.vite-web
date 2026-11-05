// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { repairEpub } from '../src/epub/repair/repairEpub';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { rebuildEpubZip } from '../src/epub/repair/rebuildEpubZip';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { assertNoNewCriticalIssues } from '../src/epub/repair/repairSafety';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';
import type { ValidationReport } from '../src/epub/model/epubTypes';

beforeAll(() => {
  if (typeof Blob.prototype.arrayBuffer === 'function') return;
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error('Blob ilegível'));
      reader.readAsArrayBuffer(this);
    });
  };
});

const signature=(r:ValidationReport)=>r.issues.map(i=>
  [i.code,i.file,i.context,i.severity,i.repairable]);
async function output() {
  const result=await repairEpub('book.epub',await buildKindleIssueEpub(),{
    ...DEFAULT_REPAIR_OPTIONS,conservativeMode:true,
  });
  expect(result.changed).toBe(true);
  expect(result.blob).toBeDefined();
  const bytes=new Uint8Array(await result.blob!.arrayBuffer());
  return {result,bytes};
}
async function mutate(bytes:Uint8Array, path:string, edit:(value:string)=>string) {
  const epub=await loadEpub('repaired.epub',bytes);
  expect(epub.validZip).toBe(true);
  const files=new Map(Array.from(epub.files,([name,entry])=>[name,entry.bytes]));
  const original=files.get(path);
  if(!original)throw Error('Arquivo não encontrado: '+path);
  files.set(path,new TextEncoder().encode(edit(new TextDecoder().decode(original))));
  return new Uint8Array(await (await rebuildEpubZip(files)).arrayBuffer());
}
describe('E-092: inspeção pós-reparo do conteúdo real após ZIP reempacotado',()=>{
  it('valida todos os recursos na cópia final, com os mesmos avisos do relatório publicado',async()=>{
    const {result,bytes}=await output();
    const independently=await inspectEpub(result.fileName,bytes);
    expect(independently.validZip).toBe(true);
    expect(signature(independently)).toEqual(signature(result.after));
    expect(independently.stats).toEqual(result.after.stats);
  });
  it('não libera cópia que introduziu fragmento XHTML quebrado',async()=>{
    const {result,bytes}=await output();
    const changed=await mutate(bytes,'OEBPS/Text/chapter1.xhtml',s=>
      s.replace('</body>','<a href="#__missing_after_99__">Nota</a></body>'));
    const after=await inspectEpub('broken.epub',changed);
    expect(after.issues.some(i=>i.code==='CONTENT_MISSING_FRAGMENT' &&
      i.context==='#__missing_after_99__')).toBe(true);
    expect(()=>assertNoNewCriticalIssues(result.after,after))
      .toThrow(/novos erros ou avisos/u);
  });
  it('não libera cópia que introduziu imagem ausente em capítulo XHTML',async()=>{
    const {result,bytes}=await output();
    const changed=await mutate(bytes,'OEBPS/Text/chapter2.xhtml',s=>
      s.replace('</body>','<img alt="Ícone" src="../Images/__not_found_99__.png"/></body>'));
    const after=await inspectEpub('broken.epub',changed);
    expect(after.issues.map(i=>i.code)).toContain('CONTENT_MISSING_RESOURCE');
    expect(()=>assertNoNewCriticalIssues(result.after,after))
      .toThrow(/novos erros ou avisos/u);
  });
  it('não acusa HTTPS editorial legítimo como link malicioso na revalidação',async()=>{
    const {result,bytes}=await output();
    const changed=await mutate(bytes,'OEBPS/Text/chapter2.xhtml',s=>
      s.replace('</body>','<a href="https://example.org/edicao">Fonte</a></body>'));
    const after=await inspectEpub('ok.epub',changed);
    expect(after.issues.some(i=>i.code==='CONTENT_UNSAFE_URL')).toBe(false);
    expect(()=>assertNoNewCriticalIssues(result.after,after)).not.toThrow();
  });
});
