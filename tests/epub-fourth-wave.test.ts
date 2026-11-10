
import { Blob as NodeBlob } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { createInitialState } from '../src/app/state';
import { loadFileIntoState, repairCurrentFile } from '../src/app/actions';
import { renderControls } from '../src/ui/components/Controls';
import { buildValidationReport } from '../src/epub/utils/reportBuilder';
import { createIssue } from '../src/epub/utils/issueFactory';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { repairEpub } from '../src/epub/repair/repairEpub';
import { updateCoverReferences } from '../src/epub/cover/updateCoverReferences';
import { extractCssResourceReferences } from '../src/epub/validation/referenceExtractor';
import { readCoverImageFile } from '../src/epub/cover/coverImageInput';
import { repairImageCompatibility } from '../src/epub/repair/repairImages';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const report = (codes: Array<'CONTENT_MISSING_RESOURCE'|'IMAGE_EMBEDDED_METADATA'> = []) =>
  buildValidationReport({
    fileName: 'corrigido.epub', fileSize: 500, validZip: true, zipEntries: [],
    issues: codes.map((code) => createIssue({
      code, severity: 'warning', title: code, detail: code, repairable: true,
    })),
  });
const actions = {
  analyze: () => {}, repair: () => {}, copy: () => {},
  downloadTextReport: () => {}, downloadJsonReport: () => {},
};
function hugeJpeg(): Uint8Array {
  
  return Uint8Array.of(255,216,255,194,0,17,8,255,255,255,255,3,
    1,17,0,2,17,1,3,17,1,255,217);
}

describe('E-123 a E-125: continuidade sem perder cópias', () => {
  it('exibe reparo adicional junto com download quando a cópia ainda é reparável', () => {
    const state = createInitialState();
    const after = report(['CONTENT_MISSING_RESOURCE']);
    state.report = after;
    state.repairResult = {
      fileName:'corrigido.epub',before:report(),after,
      actions:[],warnings:[],operation:'repair',
      blob:new Blob(['epub']),changed:true,
    };
    const buttons = renderControls(state,actions).textContent ?? '';
    expect(buttons).toContain('Baixar cópia parcial (revisar)');
    expect(buttons).toContain('Aplicar reparos restantes');
  });
  it('mantém o download anterior quando não resta reparo nem otimização', async () => {
    const state = createInitialState();
    const bytes = await buildKindleIssueEpub();
    state.payload = { file: {name:'corrigido.epub'} as File, bytes };
    const before = report();
    const previous = {
      fileName:'corrigido.epub',before,after:before,actions:[],warnings:[],
      operation:'repair' as const,changed:true,blob:new Blob(['download']),
    };
    state.report = before;
    state.repairResult = previous;
    await repairCurrentFile(state);
    expect(state.repairResult).toBe(previous);
    expect(state.repairResult?.blob).toBe(previous.blob);
  });
  it('prioriza reparo obrigatório mesmo com remoção EXIF selecionada', async () => {
    vi.stubGlobal('Blob',NodeBlob);
    try {
      const state = createInitialState();
      const bytes = await buildKindleIssueEpub();
      state.payload = {file:{name:'original.epub'} as File,bytes};
      state.report = await inspectEpub('original.epub',bytes);
      state.report.issues.push(createIssue({
        code:'IMAGE_EMBEDDED_METADATA',severity:'warning',title:'Metadados',
        detail:'Imagem tem metadados',repairable:true,file:'OEBPS/Images/cover.jpg',
      }));
      state.options.stripImageMetadata = true;
      await repairCurrentFile(state);
      expect(state.repairResult?.operation).toBe('repair');
      expect(state.repairResult?.changed).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  },30000);
});

describe('E-129: seleção malsucedida não descarta o EPUB anterior', () => {
  it('preserva estados tanto para extensão inválida quanto falha de leitura', async () => {
    const state = createInitialState();
    const bytes = Uint8Array.of(1,2,3);
    const payload = { file: {name:'anterior.epub'} as File, bytes };
    state.payload = payload;
    const previous = {
      fileName:'anterior.epub',before:report(),after:report(),
      changed:true,blob:new Blob(['epub']),actions:[],warnings:[],operation:'repair' as const,
    };
    state.repairResult = previous;
    await expect(loadFileIntoState({name:'errado.txt',size:2} as File,state))
      .rejects.toThrow(/\.epub/u);
    expect(state.payload).toBe(payload);
    expect(state.repairResult).toBe(previous);
    const unreadable = {
      name:'falha.epub',size:3,
      arrayBuffer: () => Promise.reject(new Error('Erro no dispositivo')),
    } as File;
    await expect(loadFileIntoState(unreadable,state)).rejects.toThrow('Erro no dispositivo');
    expect(state.payload).toBe(payload);
    expect(state.repairResult).toBe(previous);
  });
});

describe('E-126: recursos adicionados ao manifest recebem compatibilidade Kindle', () => {
  it('normaliza lang/xml:lang de um XHTML órfão agora declarado', async () => {
    vi.stubGlobal('Blob',NodeBlob);
    try {
      const zip = await JSZip.loadAsync(await buildKindleIssueEpub());
      const opf = await zip.file('OEBPS/content.opf')!.async('string');
      zip.file('OEBPS/content.opf', opf.replace(
        '<dc:language>UND</dc:language>', '<dc:language>pt-BR</dc:language>'));
      zip.file('OEBPS/Text/extra.xhtml',
        '<html xmlns="http://www.w3.org/1999/xhtml" lang="" xml:lang="">' +
        '<head><title>Extra</title></head><body><p>Capítulo suplementar</p></body></html>');
      const bytes = new Uint8Array(await zip.generateAsync({type:'uint8array'}));
      const result = await repairEpub('livro.epub',bytes);
      expect(result.changed).toBe(true);
      const output = await JSZip.loadAsync(await result.blob!.arrayBuffer());
      const text = await output.file('OEBPS/Text/extra.xhtml')!.async('string');
      const finalOpf = await output.file('OEBPS/content.opf')!.async('string');
      expect(text).toContain('xml:lang="pt-BR"');
      expect(text).toContain('lang="pt-BR"');
      expect(finalOpf).toContain('Text/extra.xhtml');
    } finally {
      vi.unstubAllGlobals();
    }
  },30000);
});

describe('E-128 / E-130 / E-131: limites e referências', () => {
  it('recusa JPEG gigante antes de solicitar a decodificação', async () => {
    const decode = vi.fn(() => Promise.reject(new Error('Não deveria decodificar')));
    vi.stubGlobal('createImageBitmap', decode);
    try {
      const bytes = hugeJpeg();
      const file = {
        name:'gigante.jpg',size:bytes.length,
        arrayBuffer:()=>Promise.resolve(bytes.buffer),
      } as File;
      await expect(readCoverImageFile(file)).rejects.toThrow(/dimensões/iu);
      expect(decode).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('não tenta descompactar JPEG progressivo de dimensões extremas', async () => {
    const path = 'OPS/Images/large.jpg';
    const bytes = hugeJpeg();
    const files = new Map([[path,bytes]]);
    const pkg = {manifest:[{
      id:'img',resolvedPath:path,exists:true,mediaType:'image/jpeg',properties:[],
    }]} as unknown as PackageDocumentInfo;
    const actions = await repairImageCompatibility(files,pkg,{
      kindleSafeMode:true,conservativeMode:false,
    });
    expect(actions[0]?.type).toBe('skipped');
    expect(files.get(path)).toBe(bytes);
  });
  it('redireciona URI de imagem com percent-escapes em minúsculas', () => {
    const path = 'OPS/Text/cover.xhtml';
    const xhtml = '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
      '<img src="../Images/capa%20(%c3%a9).png"/></body></html>';
    const files = new Map([[path,new TextEncoder().encode(xhtml)]]);
    const pkg = {manifest:[{
      id:'cover',resolvedPath:path,mediaType:'application/xhtml+xml',exists:true,properties:[],
    }]} as unknown as PackageDocumentInfo;
    const changed = updateCoverReferences(files,pkg,
      'OPS/Images/capa (é).png','OPS/Images/nova.jpg');
    expect(changed).toHaveLength(1);
    expect(new TextDecoder().decode(files.get(path))).toContain('../Images/nova.jpg');
  });
  it('conta @import url uma vez sem confundir background independente', () => {
    const refs = extractCssResourceReferences(
      '@import url("base.css"); .a{background:url("figura.png")}');
    expect(refs.filter((ref)=>ref.value==='base.css')).toHaveLength(1);
    expect(refs.map((ref)=>ref.value)).toEqual(expect.arrayContaining(['base.css','figura.png']));
    expect(refs.find((ref)=>ref.value==='base.css')?.attr).toBe('css:import');
  });
});
