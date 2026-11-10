
import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../src/app/state';
import { renderOptionsPanel } from '../src/ui/components/OptionsPanel';
import { renderUploader } from '../src/ui/components/Uploader';

describe('E-081: opções e arquivos não mudam durante processamento', () => {
  it('desabilita e ignora mudanças de opções enquanto o job está ocupado', () => {
    const state = createInitialState();
    state.busy = true;
    const onChange = vi.fn();
    const panel = renderOptionsPanel(state, onChange);
    const input = panel.querySelector<HTMLInputElement>('#sanitizeScripts')!;
    expect(input.disabled).toBe(true);
    const original = state.options.sanitizeScripts;
    input.checked = !original;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(state.options.sanitizeScripts).toBe(original);
    expect(onChange).not.toHaveBeenCalled();
  });
  it('não aceita upload ou drop enquanto análise/reparo está rodando', () => {
    const state = createInitialState();
    state.busy = true;
    const onFile = vi.fn();
    const root = renderUploader(state, onFile);
    const input = root.querySelector<HTMLInputElement>('#epub-file-input')!;
    expect(input.disabled).toBe(true);
    expect(root.querySelector('.dropzone')?.getAttribute('aria-disabled')).toBe('true');
    const event = new Event('drop', { cancelable: true, bubbles: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [
      new File(['epub'], 'book.epub'),
    ] } });
    root.querySelector('.dropzone')?.dispatchEvent(event);
    expect(onFile).not.toHaveBeenCalled();
  });
  it('libera opções após a operação e mantém dados de estado independentes', () => {
    const state = createInitialState();
    const onChange = vi.fn();
    const panel = renderOptionsPanel(state, onChange);
    const input = panel.querySelector<HTMLInputElement>('#sanitizeScripts')!;
    expect(input.disabled).toBe(false);
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(state.options.sanitizeScripts).toBe(false);
    expect(onChange).toHaveBeenCalledOnce();
  });
});
