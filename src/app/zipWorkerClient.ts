import type { LoadedEpub } from '../epub/model/epubTypes';
import { loadEpub, type ZipLoadProgress } from '../epub/reader/loadEpub';
import type { PortableLoadedEpub, ZipWorkerRequest, ZipWorkerResponse } from './zipLoadWorker';

export interface ZipWorkerOptions {
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: ZipLoadProgress) => void) | undefined;
   
  createWorker?: (() => Worker) | undefined;
}

export function abortProcessingError(): DOMException {
  return new DOMException('Operação cancelada pelo usuário.', 'AbortError');
}

export function throwIfProcessingAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortProcessingError();
}






export async function loadEpubInWorker(
  fileName: string,
  bytes: Uint8Array,
  options: ZipWorkerOptions = {},
): Promise<LoadedEpub> {
  throwIfProcessingAborted(options.signal);
  let worker: Worker;
  try {
    if (options.createWorker) worker = options.createWorker();
    else if (typeof Worker !== 'undefined') {
      worker = new Worker(new URL('./zipLoadWorker.ts', import.meta.url), { type: 'module' });
    } else {
      return await loadWithoutWorker(fileName, bytes, options);
    }
  } catch {
    return await loadWithoutWorker(fileName, bytes, options);
  }

  return new Promise<LoadedEpub>((resolve, reject) => {
    let done = false;
    const cleanup = (): void => {
      if (done) return;
      done = true;
      options.signal?.removeEventListener('abort', cancel);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.terminate();
    };
    const cancel = (): void => {
      cleanup();
      reject(abortProcessingError());
    };
    const onError = (): void => {
      cleanup();
      reject(new Error('O Worker interrompeu a extração do ZIP.'));
    };
    const onMessage = (event: MessageEvent<ZipWorkerResponse>): void => {
      if (done) return;
      const data = event.data;
      if (data.type === 'progress') {
        options.onProgress?.({
          completed: data.completed, total: data.total,
          ...(data.path ? { path: data.path } : {}),
        });
        return;
      }
      cleanup();
      if (data.type === 'error') {
        reject(new Error(data.message));
        return;
      }
      const loaded: PortableLoadedEpub = data.loaded;
      resolve({ ...loaded, bytes });
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) {
      cancel();
      return;
    }
    try {
      const request: ZipWorkerRequest = { type: 'load', fileName, bytes };
      worker.postMessage(request);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error('Worker não iniciou.'));
    }
  });
}

async function loadWithoutWorker(
  fileName: string,
  bytes: Uint8Array,
  options: ZipWorkerOptions,
): Promise<LoadedEpub> {
  const loaded = await loadEpub(fileName, bytes, options.onProgress, options.signal);
  throwIfProcessingAborted(options.signal);
  return loaded;
}
