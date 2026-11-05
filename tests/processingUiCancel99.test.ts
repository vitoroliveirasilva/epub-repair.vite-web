// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../src/app/state';
import { analyzeCurrentFile, repairCurrentFile } from '../src/app/actions';
import { renderControls } from '../src/ui/components/Controls';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';

const actions = {
  analyze:()=>{}, repair:()=>{}, copy:()=>{},
  downloadTextReport:()=>{},downloadJsonReport:()=>{},
  cancel:vi.fn(),
};
describe('E-080: progresso sem porcentagem inventada e cancelamento seguro', () => {
  it('mostra arquivos processados e botão acessível no estado ocupado', () => {
    const state=createInitialState();state.busy=true;
    const controller=new AbortController();state.processingController=controller;
    state.processingProgress={phase:'Descompactando EPUB no Worker...',
      completed:3,total:11};
    const element=renderControls(state,actions);
    expect(element.textContent).toContain('3 de 11 entradas');
    expect(element.querySelector('progress')?.value).toBe(3);
    expect(element.querySelector('progress')?.max).toBe(11);
    const button=Array.from(element.querySelectorAll('button')).find(x=>
      x.textContent==='Cancelar operação')!;
    button.click();
    expect(actions.cancel).toHaveBeenCalledOnce();
  });
  it('cancelamento desabilita ação, mas não finge sucesso da análise', () => {
    const state=createInitialState();state.busy=true;
    const controller=new AbortController();state.processingController=controller;
    controller.abort();
    const element=renderControls(state,actions);
    const cancel=Array.from(element.querySelectorAll('button')).find(x=>
      x.textContent==='Cancelar operação')!;
    expect(cancel.disabled).toBe(true);
  });
  it('sinal já abortado impede publicar análise nova', async () => {
    const input=await buildKindleIssueEpub();
    const state=createInitialState();
    state.payload={file:new File([input],'book.epub'),bytes:input};
    const controller=new AbortController();controller.abort();
    await expect(analyzeCurrentFile(state,{signal:controller.signal}))
      .rejects.toMatchObject({name:'AbortError'});
    expect(state.report).toBeUndefined();
    expect(state.busy).toBe(false);
  });
  it('sinal já abortado impede reparo e preserva resultado anterior', async () => {
    const input=await buildKindleIssueEpub();
    const state=createInitialState();
    state.payload={file:new File([input],'book.epub'),bytes:input};
    const original=state.repairResult;
    const controller=new AbortController();controller.abort();
    await expect(repairCurrentFile(state,{signal:controller.signal}))
      .rejects.toMatchObject({name:'AbortError'});
    expect(state.repairResult).toBe(original);
    expect(state.busy).toBe(false);
  });
});
