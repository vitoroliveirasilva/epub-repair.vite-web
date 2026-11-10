
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app/createApp';
import { captureFocusForRerender } from '../src/app/focusRestoration';

afterEach(() => { document.body.replaceChildren(); });

describe('E-083: acessibilidade de foco após renderização integral', () => {
  it('preserva o foco ao alterar opções via teclado', () => {
    const root = document.createElement('div');
    document.body.append(root);
    createApp(root);
    const before = root.querySelector<HTMLInputElement>('#sanitizeScripts');
    expect(before).toBeTruthy();
    before!.focus();
    before!.click();
    const after = root.querySelector<HTMLInputElement>('#sanitizeScripts');
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
    expect(document.activeElement).toBe(after);
    expect(after?.checked).toBe(false);
  });
  it('preserva botão de mesmo nome sem id nem classe obrigatória', () => {
    const root = document.createElement('div');
    document.body.append(root);
    root.innerHTML = '<button>Simples</button>';
    root.querySelector('button')?.focus();
    const restore = captureFocusForRerender(root);
    root.innerHTML = '<button>Simples</button>';
    restore();
    expect(document.activeElement).toBe(root.querySelector('button'));
  });
  it('evita devolver foco ao body quando a ação desapareceu', () => {
    const root = document.createElement('div');
    document.body.append(root);
    root.innerHTML = '<main id="app-workspace" tabindex="-1"><button>Processar</button></main>';
    root.querySelector('button')?.focus();
    const restore = captureFocusForRerender(root);
    root.innerHTML = '<main id="app-workspace" tabindex="-1"><p>Processamento concluído</p></main>';
    restore();
    expect(document.activeElement).toBe(root.querySelector('main'));
  });
  it('preserva cursor e seleção de input textual entre renderizações', () => {
    const root = document.createElement('div');
    document.body.append(root);
    root.innerHTML = '<input id="query" value="abcdef"/>';
    const input = root.querySelector<HTMLInputElement>('input')!;
    input.focus();
    input.setSelectionRange(3, 3);
    const restore = captureFocusForRerender(root);
    root.innerHTML = '<input id="query" value="abcdef"/>';
    restore();
    const next = root.querySelector<HTMLInputElement>('input')!;
    expect(document.activeElement).toBe(next);
    expect(next.selectionStart).toBe(3);
  });
});
