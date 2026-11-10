
import { beforeAll, describe, expect, it } from 'vitest';
import { rebuildEpubZip } from '../src/epub/repair/rebuildEpubZip';
import { repairEpub } from '../src/epub/repair/repairEpub';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';
import JSZip from 'jszip';

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

describe('E-080: progresso real durante recompactação ZIP', () => {
  it('recebe eventos de recompactação, com tamanho e ZIP final íntegros', async () => {
    const reports:number[]=[];
    const files=new Map<string,Uint8Array>([
      ['OPS/chapter.xhtml',new TextEncoder().encode('<p>Texto</p>')],
      ['OPS/style.css',new TextEncoder().encode('p{font-style:italic}')],
    ]);
    const blob=await rebuildEpubZip(files,(info)=>reports.push(info.percent));
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.every(x=>x>=0&&x<=100)).toBe(true);
    expect(Math.max(...reports)).toBe(100);
    const zip=await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await zip.file('OPS/style.css')!.async('string')).toContain('italic');
  });
  it('abortar durante geração impede publicar reparo depois de o ZIP terminar', async () => {
    const original=await buildKindleIssueEpub();
    const controller=new AbortController();
    let events=0;
    await expect(repairEpub('book.epub',original,{
      ...DEFAULT_REPAIR_OPTIONS,conservativeMode:true,
    },'repair',undefined,controller.signal,()=>{
      events+=1;
      controller.abort();
    })).rejects.toMatchObject({name:'AbortError'});
    expect(events).toBeGreaterThan(0);
  });
});
