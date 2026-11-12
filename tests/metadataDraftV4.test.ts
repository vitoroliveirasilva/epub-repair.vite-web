import { afterEach, describe, expect, it } from 'vitest';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { metadataChanges, metadataChangeCount } from '../src/epub/tools/metadataDraft';
import { renderOptionalEpubTools } from '../src/ui/optionalEpubTools';
import { createInitialState, type AppState } from '../src/app/state';
import type { BookMetadata } from '../src/epub/tools/bookTools';

const metadata: BookMetadata = {
  title: 'Livro', creator: 'Autor', additionalCreators: 'Colaborador',
  language: 'pt-BR', identifier: 'urn:uuid:123', publisher: '',
  date: '', description: '', subject: '', series: '', seriesIndex: '',
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('Rascunhos seguros de metadados', () => {
  it('só envia campos alterados, mantendo dados não preenchidos', () => {
    const draft = { ...metadata, title: 'Livro revisado', language: '',
      additionalCreators: 'Colaborador' };
    expect(metadataChanges(metadata, draft)).toEqual({ title: 'Livro revisado' });
    expect(metadataChangeCount(metadata, draft)).toBe(1);
    expect(metadataChangeCount(metadata, { ...metadata })).toBe(0);
  });

  it('não perde alterações ao trocar de ferramenta e mantém o botão desabilitado sem mudanças', async () => {
    const bytes = await buildKindleIssueEpub();
    const state: AppState = createInitialState();
    state.payload = { file: new File(['fixture'], 'livro.epub'), bytes };
    const host = document.createElement('div');
    document.body.append(host);
    let pending: Promise<void> | undefined;
    const render = (): void => {
      host.replaceChildren(renderOptionalEpubTools(state, render, (_label, task) => {
        pending = task({ signal: new AbortController().signal, onProgress: () => {} });
      }));
    };
    const click = (label: string): void => {
      const element = Array.from(host.querySelectorAll('button')).find((button) =>
        button.textContent?.trim() === label);
      if (!element) throw new Error('Botão não encontrado: ' + label);
      element.click();
    };
    const titleInput = (): HTMLInputElement => {
      const label = Array.from(host.querySelectorAll('label')).find((item) =>
        item.querySelector('span')?.textContent === 'Título');
      const input = label?.querySelector('input');
      if (!input) throw new Error('Campo título não encontrado');
      return input;
    };

    render();
    click('Metadados');
    click('Carregar metadados');
    await pending;
    render();

    expect(titleInput().value).toBe('Fixture Kindle Safe');
    const noChange = Array.from(host.querySelectorAll('button')).find((btn) =>
      btn.textContent?.trim() === 'Gerar EPUB com metadados');
    expect(noChange?.disabled).toBe(true);

    const input = titleInput();
    input.value = 'Título digitado, ainda não salvo';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    click('Preparar Kindle');
    click('Metadados');
    expect(titleInput().value).toBe('Título digitado, ainda não salvo');
    const save = Array.from(host.querySelectorAll('button')).find((btn) =>
      btn.textContent?.trim() === 'Gerar EPUB com metadados');
    expect(save?.disabled).toBe(false);

    titleInput().value = 'Fixture Kindle Safe';
    titleInput().dispatchEvent(new Event('input', { bubbles: true }));
    expect(save?.disabled).toBe(true);
  });
});
