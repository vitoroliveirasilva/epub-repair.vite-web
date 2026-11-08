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
  it('E-080: apresenta porcentagem real de recompactação, sem fingir entradas', () => {
    const state=createInitialState();
    state.busy=true;
    state.processingController=new AbortController();
    state.processingProgress={phase:'Recompactando EPUB...',
      completed:38,total:100,unit:'percent'};
    const view=renderControls(state,actions);
    expect(view.textContent).toContain('38% recompactado');
    expect(view.textContent).not.toContain('38 de 100 entradas');
    expect(view.querySelector('progress')?.getAttribute('aria-label'))
      .toBe('Porcentagem do ZIP recompactado');
  });
  it('E-080: permite agendar verificação na UI enquanto processa EPUB', () => {
    const state=createInitialState();
    state.payload={file:new File(['zip'],'book.epub'),bytes:new Uint8Array()};
    state.busy=true;
    state.pendingTasks=3;
    state.activeTask='Verificar EPUB';
    state.processingController=new AbortController();
    const page=renderControls(state,actions);
    const scheduled=Array.from(page.querySelectorAll('button'))
      .find(x=>x.textContent==='Enfileirar verificação');
    expect(scheduled?.disabled).toBe(false);
    expect(page.textContent).toContain('3 ação(ões) agendada(s)');
    expect(page.textContent).toContain('Cancelar operação e fila');
    state.pendingTasks=8;
    const maxed=renderControls(state,actions);
    const blocked=Array.from(maxed.querySelectorAll('button'))
      .find(x=>x.textContent==='Enfileirar verificação');
    expect(blocked?.disabled).toBe(true);
  });
  it('não enfileira nova verificação se uma reparação pode gerar saída que seria perdida', () => {
    const state=createInitialState();
    state.payload={file:new File(['zip'],'book.epub'),bytes:new Uint8Array()};
    state.busy=true;
    state.activeTask='Reparar EPUB';
    let view=renderControls(state,actions);
    let btn=Array.from(view.querySelectorAll('button'))
      .find(x=>x.textContent==='Enfileirar verificação');
    expect(btn?.disabled).toBe(true);
    state.activeTask='Verificar EPUB';
    state.hasPendingMutation=true;
    view=renderControls(state,actions);
    btn=Array.from(view.querySelectorAll('button'))
      .find(x=>x.textContent==='Enfileirar verificação');
    expect(btn?.disabled).toBe(true);
  });
  it('sinal já abortado impede publicar análise nova', async () => {
    const input=await buildKindleIssueEpub();
    const state=createInitialState();
    state.payload={file:new File(['epub fixture'],'book.epub'),bytes:input};
    const controller=new AbortController();controller.abort();
    await expect(analyzeCurrentFile(state,{signal:controller.signal}))
      .rejects.toMatchObject({name:'AbortError'});
    expect(state.report).toBeUndefined();
    expect(state.busy).toBe(false);
  });
  it('sinal já abortado impede reparo e preserva resultado anterior', async () => {
    const input=await buildKindleIssueEpub();
    const state=createInitialState();
    state.payload={file:new File(['epub fixture'],'book.epub'),bytes:input};
    const original=state.repairResult;
    const controller=new AbortController();controller.abort();
    await expect(repairCurrentFile(state,{signal:controller.signal}))
      .rejects.toMatchObject({name:'AbortError'});
    expect(state.repairResult).toBe(original);
    expect(state.busy).toBe(false);
  });
});
