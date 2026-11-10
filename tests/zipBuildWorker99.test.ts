
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { rebuildEpubZipInWorker } from '../src/epub/repair/zipBuildWorkerClient';
import type { BuildZipResponse } from '../src/epub/repair/zipBuildWorker';
import JSZip from 'jszip';

class MockWorker {
  handlers=new Map<string,Set<(event:Event)=>void>>();
  postMessage=vi.fn();
  terminate=vi.fn();
  addEventListener(type:string,callback:(event:Event)=>void):void {
    const handlers=this.handlers.get(type)??new Set();
    handlers.add(callback);this.handlers.set(type,handlers);
  }
  removeEventListener(type:string,callback:(event:Event)=>void):void {
    this.handlers.get(type)?.delete(callback);
  }
  send(data:BuildZipResponse):void {
    const event=new MessageEvent('message',{data});
    for(const callback of this.handlers.get('message')??[]) callback(event);
  }
  error():void {
    for(const callback of this.handlers.get('error')??[])callback(new Event('error'));
  }
}

beforeAll(() => {
  if (typeof Blob.prototype.arrayBuffer === 'function') return;
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error('Blob inválido'));
      reader.readAsArrayBuffer(this);
    });
  };
});
afterEach(()=>{vi.unstubAllGlobals()});
describe('E-032/E-080: recompactação em Worker com cancelamento',()=>{
  const files=new Map<string,Uint8Array>([
    ['OPS/a.xhtml',new TextEncoder().encode('<p>Conteúdo editorial</p>')],
    ['OPS/style.css',new TextEncoder().encode('p{font-weight:600}')],
  ]);
  it('envia mapa sem transferir/destacar os bytes originais',async()=>{
    const mock=new MockWorker();
    const reports:number[]=[];
    const running=rebuildEpubZipInWorker(files,{
      createWorker:()=>mock as unknown as Worker,
      onProgress:(info)=>reports.push(info.percent),
    });
    expect(mock.postMessage).toHaveBeenCalledOnce();
    const message=mock.postMessage.mock.calls[0]![0] as {type:string,files:Map<string,Uint8Array>};
    expect(message.type).toBe('build');
    expect(message.files).toBe(files);
    mock.send({type:'progress',percent:39,path:'OPS/a.xhtml'});
    mock.send({type:'progress',percent:100});
    const binary=Uint8Array.from([80,75,3,4]).buffer;
    mock.send({type:'built',bytes:binary});
    const blob=await running;
    expect(blob.size).toBe(4);
    expect(reports).toEqual([39,100]);
    expect(mock.terminate).toHaveBeenCalledOnce();
    expect(new TextDecoder().decode(files.get('OPS/a.xhtml'))).toContain('editorial');
  });
  it('sinal abortado termina Worker durante ZIP e descarta resultado tardio',async()=>{
    const mock=new MockWorker();
    const controller=new AbortController();
    const running=rebuildEpubZipInWorker(files,{
      createWorker:()=>mock as unknown as Worker,signal:controller.signal,
    });
    mock.send({type:'progress',percent:33});
    controller.abort();
    await expect(running).rejects.toMatchObject({name:'AbortError'});
    mock.send({type:'built',bytes:new ArrayBuffer(50)});
    expect(mock.terminate).toHaveBeenCalledOnce();
  });
  it('cancelamento anterior impede criar Worker',async()=>{
    const mock=new MockWorker();
    const controller=new AbortController();controller.abort();
    await expect(rebuildEpubZipInWorker(files,{
      createWorker:()=>mock as unknown as Worker,signal:controller.signal,
    })).rejects.toMatchObject({name:'AbortError'});
    expect(mock.postMessage).not.toHaveBeenCalled();
  });
  it('erro do Worker não publica Blob',async()=>{
    const mock=new MockWorker();
    const running=rebuildEpubZipInWorker(files,{
      createWorker:()=>mock as unknown as Worker,
    });
    mock.error();
    await expect(running).rejects.toThrow(/Worker falhou/u);
    expect(mock.terminate).toHaveBeenCalledOnce();
  });
  it('sem Worker gera ZIP válido e preserva conteúdo',async()=>{
    vi.stubGlobal('Worker',undefined);
    const blob=await rebuildEpubZipInWorker(files);
    const unpacked=await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await unpacked.file('OPS/a.xhtml')!.async('string'))
      .toBe('<p>Conteúdo editorial</p>');
  });
});
