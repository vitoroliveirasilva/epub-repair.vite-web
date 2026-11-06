import { rebuildEpubZip } from './rebuildEpubZip';

export type BuildZipRequest = { type: 'build'; files: Map<string, Uint8Array> };
export type BuildZipResponse =
  | { type: 'progress'; percent: number; path?: string | undefined }
  | { type: 'built'; bytes: ArrayBuffer }
  | { type: 'error'; message: string };

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<BuildZipRequest>) => void) | null;
  postMessage(message: BuildZipResponse, transfer?: Transferable[]): void;
};

scope.onmessage = (event) => {
  if (event.data?.type !== 'build') return;
  void rebuildEpubZip(event.data.files, ({percent,currentFile}) => {
    scope.postMessage({type:'progress',percent,
      ...(currentFile?{path:currentFile}:{})});
  }).then(async (blob) => {
    const bytes=await blob.arrayBuffer();
    scope.postMessage({type:'built',bytes},[bytes]);
  }).catch((err:unknown) => {
    scope.postMessage({type:'error',
      message:err instanceof Error?err.message:'Falha ao recompactar EPUB.'});
  });
};
