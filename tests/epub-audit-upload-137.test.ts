// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/app/state';
import { loadAndAnalyzeCandidate } from '../src/app/actions';
import { buildValidationReport } from '../src/epub/utils/reportBuilder';

describe('E-137: upload inválido não substitui cópia corrigida',()=>{
  it('retém original, blob de download e diagnóstico de novo arquivo inválido',async()=>{
    const state=createInitialState();
    const payload={file:{name:'anterior.epub'} as File,bytes:Uint8Array.of(1,2,3)};
    const report=buildValidationReport({
      fileName:'anterior.epub',fileSize:3,validZip:true,zipEntries:[],issues:[],
    });
    state.payload=payload;
    state.report=report;
    state.repairResult={
      fileName:'anterior.epub',before:report,after:report,
      changed:true,blob:new Blob(['arquivo preservado']),operation:'repair',
      actions:[],warnings:[],
    };
    const previous=state.repairResult;
    const bytes=new TextEncoder().encode('Isto não é um arquivo ZIP EPUB.');
    const badFile={
      name:'falha.epub',size:bytes.length,
      arrayBuffer:()=>Promise.resolve(new Uint8Array(bytes).buffer),
    } as File;
    await loadAndAnalyzeCandidate(badFile,state);
    expect(state.payload).toBe(payload);
    expect(state.repairResult).toBe(previous);
    expect(state.repairResult.blob).toBe(previous.blob);
    expect(state.invalidUploadReport?.fileName).toBe('falha.epub');
    expect(state.invalidUploadReport?.validZip).toBe(false);
    expect(state.message).toMatch(/preservada/iu);
  });
});
