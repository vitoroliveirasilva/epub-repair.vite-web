import { loadEpub } from '../epub/reader/loadEpub';
import type { LoadedEpub } from '../epub/model/epubTypes';

export type PortableLoadedEpub = Omit<LoadedEpub, 'bytes' | 'zip'>;

export type ZipWorkerRequest = {
  type: 'load';
  fileName: string;
  bytes: Uint8Array;
};

export type ZipWorkerResponse =
  | { type: 'progress'; completed: number; total: number; path?: string | undefined }
  | { type: 'loaded'; loaded: PortableLoadedEpub }
  | { type: 'error'; message: string };



const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ZipWorkerRequest>) => void) | null;
  postMessage(message: ZipWorkerResponse, transfer?: Transferable[]): void;
};

scope.onmessage = (event) => {
  if (event.data.type !== 'load') return;
  const { fileName, bytes } = event.data;
  void loadEpub(fileName, bytes, (progress) => {
    scope.postMessage({ type: 'progress', ...progress });
  }).then((loaded) => {
    
    
    const portable: PortableLoadedEpub = {
      fileName: loaded.fileName,
      fileSize: loaded.fileSize,
      rawEntries: loaded.rawEntries,
      files: loaded.files,
      fileNames: loaded.fileNames,
      issues: loaded.issues,
      validZip: loaded.validZip,
    };
    const buffers = new Set<ArrayBuffer>();
    for (const entry of portable.files.values()) {
      if (entry.bytes.buffer instanceof ArrayBuffer) buffers.add(entry.bytes.buffer);
    }
    scope.postMessage({ type: 'loaded', loaded: portable }, Array.from(buffers));
  }).catch((error: unknown) => {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Falha na descompactação EPUB.',
    });
  });
};
