// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEpubInWorker } from '../src/app/zipWorkerClient';
import type { ZipWorkerResponse } from '../src/app/zipLoadWorker';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { loadEpub } from '../src/epub/reader/loadEpub';

class MockWorker {
  readonly handlers = new Map<string, Set<(event: Event) => void>>();
  readonly terminate = vi.fn();
  readonly postMessage = vi.fn();
  addEventListener(type: string, listener: (event: Event) => void): void {
    const handlers = this.handlers.get(type) ?? new Set();
    handlers.add(listener);
    this.handlers.set(type, handlers);
  }
  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.handlers.get(type)?.delete(listener);
  }
  respond(data: ZipWorkerResponse): void {
    const event = new MessageEvent('message', { data });
    for (const handler of this.handlers.get('message') ?? []) handler(event);
  }
  fail(): void {
    for (const handler of this.handlers.get('error') ?? []) handler(new Event('error'));
  }
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('E-032/E-080: extração ZIP via Worker cancelável', () => {
  it('transmite progresso real e retorna ZIP carregado sem componente JSZip serializado', async () => {
    const worker = new MockWorker();
    const input = new Uint8Array([80,75,3,4]);
    const reports: number[] = [];
    const running = loadEpubInWorker('book.epub', input, {
      createWorker: () => worker as unknown as Worker,
      onProgress: (value) => reports.push(value.completed),
    });
    expect(worker.postMessage).toHaveBeenCalledOnce();
    worker.respond({ type:'progress', completed:1, total:3, path:'OPS/book.opf' });
    worker.respond({ type:'progress', completed:2, total:3 });
    worker.respond({ type:'loaded', loaded: {
      fileName:'book.epub',fileSize:input.byteLength, files:new Map(),rawEntries:[],
      fileNames:[], issues:[], validZip:true,
    } });
    const data = await running;
    expect(reports).toEqual([1,2]);
    expect(data.bytes).toBe(input);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it('cancelamento termina Worker e descarta resultado tardio sem reabrir arquivo', async () => {
    const controller = new AbortController();
    const worker = new MockWorker();
    const run = loadEpubInWorker('cancel.epub',new Uint8Array(100), {
      signal:controller.signal,createWorker:()=>worker as unknown as Worker,
    });
    controller.abort();
    await expect(run).rejects.toMatchObject({name:'AbortError'});
    expect(worker.terminate).toHaveBeenCalledOnce();
    worker.respond({type:'loaded',loaded:{
      fileName:'cancel.epub',fileSize:0,files:new Map(),rawEntries:[],
      fileNames:[],issues:[],validZip:true,
    }});
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it('erro do Worker não produz relatório de sucesso', async () => {
    const worker = new MockWorker();
    const run=loadEpubInWorker('error.epub',new Uint8Array(4),{
      createWorker:()=>worker as unknown as Worker,
    });
    worker.fail();
    await expect(run).rejects.toThrow(/interrompeu/u);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it('sem API Worker usa parser existente e retorna o mesmo EPUB', async () => {
    vi.stubGlobal('Worker',undefined);
    const data=await buildKindleIssueEpub();
    const expected=await loadEpub('book.epub',data);
    const actual=await loadEpubInWorker('book.epub',data);
    expect(actual.validZip).toBe(expected.validZip);
    expect([...actual.files.keys()]).toEqual([...expected.files.keys()]);
  });
  it('sinal cancelado antes de criar Worker bloqueia processamento', async () => {
    const controller=new AbortController();controller.abort();
    const creator=vi.fn(()=>new MockWorker() as unknown as Worker);
    await expect(loadEpubInWorker('book.epub',new Uint8Array(),{
      signal:controller.signal,createWorker:creator,
    })).rejects.toMatchObject({name:'AbortError'});
    expect(creator).not.toHaveBeenCalled();
  });
});
