import { describe, expect, it, vi } from 'vitest';
import { SerialTaskQueue } from '../src/app/taskQueue';

function deferred(){
  let resolve!:()=>void;
  const promise=new Promise<void>((ok)=>{resolve=ok;});
  return {promise,resolve};
}
const flush=async()=>{for(let i=0;i<4;i++) await new Promise(r=>setTimeout(r,0));};

describe('E-080: fila FIFO de ações para mesmo EPUB',()=>{
  it('executa em ordem, nunca em paralelo, e atualiza contagem',async()=>{
    const changes:number[]=[];
    const queue=new SerialTaskQueue(n=>changes.push(n));
    const d=deferred();
    const order:string[]=[];
    expect(queue.enqueue({label:'análise',run:async()=>{
      order.push('start-analysis');await d.promise;order.push('finish-analysis');
    }})).toBe(true);
    queue.enqueue({label:'reparo',run:async()=>{order.push('repair')}});
    expect(queue.pendingCount).toBe(1);
    expect(order).toEqual(['start-analysis']);
    d.resolve();
    await flush();
    expect(order).toEqual(['start-analysis','finish-analysis','repair']);
    expect(queue.pendingCount).toBe(0);
    expect(changes).toContain(1);
  });
  it('cancelar fila descarta pendentes sem cancelar tarefa ativa',async()=>{
    const d=deferred();
    const processed:string[]=[];
    const queue=new SerialTaskQueue(()=>{});
    queue.enqueue({label:'a',run:async()=>{processed.push('a');await d.promise;}});
    queue.enqueue({label:'b',run:async()=>{processed.push('b')}});
    queue.enqueue({label:'c',run:async()=>{processed.push('c')}});
    expect(queue.clearPending()).toBe(2);
    d.resolve();await flush();
    expect(processed).toEqual(['a']);
  });
  it('falha individual não bloqueia próximas tarefas',async()=>{
    const processed:string[]=[];
    const queue=new SerialTaskQueue(()=>{});
    queue.enqueue({label:'broken',run:async()=>{throw new Error('erro');}});
    queue.enqueue({label:'ok',run:async()=>{processed.push('ok')}});
    await flush();
    expect(processed).toEqual(['ok']);
  });
  it('limite de 8 pendentes evita estourar memória por cliques repetidos',async()=>{
    const d=deferred();const tasks=vi.fn(async()=>d.promise);
    const queue=new SerialTaskQueue(()=>{},8);
    expect(queue.enqueue({label:'active',run:tasks})).toBe(true);
    for(let i=0;i<8;i++)
      expect(queue.enqueue({label:String(i),run:async()=>{}})).toBe(true);
    expect(queue.enqueue({label:'extra',run:async()=>{}})).toBe(false);
    expect(queue.pendingCount).toBe(8);
    expect(queue.clearPending()).toBe(8);
    d.resolve();await flush();
    expect(tasks).toHaveBeenCalledTimes(1);
  });
});
