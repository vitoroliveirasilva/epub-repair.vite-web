import { rebuildEpubZip, type ZipBuildProgress } from './rebuildEpubZip';
import type { BuildZipRequest, BuildZipResponse } from './zipBuildWorker';
import { EPUB_MIME } from '../utils/constants';

 
export interface ZipBuildOptions {
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: ZipBuildProgress) => void) | undefined;
  createWorker?: (() => Worker) | undefined;
}

function canceled(): DOMException {
  return new DOMException('Recompactação cancelada.', 'AbortError');
}
function ensureNotCanceled(signal?: AbortSignal): void {
  if(signal?.aborted) throw canceled();
}







export async function rebuildEpubZipInWorker(
  files: Map<string, Uint8Array>,
  options: ZipBuildOptions = {},
): Promise<Blob> {
  ensureNotCanceled(options.signal);
  let worker: Worker;
  try {
    if(options.createWorker) worker=options.createWorker();
    else if(typeof Worker!=='undefined')
      worker=new Worker(new URL('./zipBuildWorker.ts',import.meta.url),{type:'module'});
    else return await fallback(files,options);
  } catch {
    return await fallback(files,options);
  }

  return new Promise<Blob>((resolve,reject)=>{
    let settled=false;
    const cleanup=():void=>{
      if(settled) return;
      settled=true;
      options.signal?.removeEventListener('abort',cancel);
      worker.removeEventListener('message',onMessage);
      worker.removeEventListener('error',onError);
      worker.terminate();
    };
    const cancel=():void=>{cleanup();reject(canceled());};
    const onError=():void=>{
      cleanup();reject(new Error('O Worker falhou durante a recompactação.'));
    };
    const onMessage=(event:MessageEvent<BuildZipResponse>):void=>{
      if(settled) return;
      if(event.data.type==='progress'){
        options.onProgress?.({percent:event.data.percent,
          ...(event.data.path?{currentFile:event.data.path}:{})});
        return;
      }
      cleanup();
      if(event.data.type==='error'){
        reject(new Error(event.data.message));
        return;
      }
      resolve(new Blob([event.data.bytes],{type:EPUB_MIME}));
    };
    worker.addEventListener('message',onMessage);
    worker.addEventListener('error',onError);
    options.signal?.addEventListener('abort',cancel,{once:true});
    if(options.signal?.aborted){cancel();return;}
    try {
      const request:BuildZipRequest={type:'build',files};
      worker.postMessage(request);
    } catch(err){
      cleanup();
      reject(err instanceof Error?err:new Error('Não foi possível iniciar recompactação.'));
    }
  });
}

async function fallback(files: Map<string,Uint8Array>,options:ZipBuildOptions):Promise<Blob>{
  const blob=await rebuildEpubZip(files,progress=>{
    ensureNotCanceled(options.signal);
    options.onProgress?.(progress);
  });
  ensureNotCanceled(options.signal);
  return blob;
}
