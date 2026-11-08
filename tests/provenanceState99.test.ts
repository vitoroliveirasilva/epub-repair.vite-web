// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { createInitialState } from '../src/app/state';
import { loadFileIntoState } from '../src/app/actions';

beforeAll(() => {
  if (typeof File.prototype.arrayBuffer === 'function') return;
  File.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error(reader.error?.message ?? 'Arquivo de teste ilegível'));
      reader.readAsArrayBuffer(this);
    });
  };
});

describe('E-084: prova de origem do EPUB', () => {
  it('preserva nome e bytes de origem após alterações no payload atual', async () => {
    const state = createInitialState();
    const file = new File(['livro original'], 'meu-livro.epub', { type: 'application/epub+zip' });
    await loadFileIntoState(file, state);
    expect(state.originalSource?.fileName).toBe('meu-livro.epub');
    expect(new TextDecoder().decode(state.originalSource?.bytes)).toBe('livro original');

    state.payload = {
      file: new File(['livro editado'], 'meu-livro-corrigido.epub'),
      bytes: new TextEncoder().encode('livro editado'),
    };
    expect(new TextDecoder().decode(state.originalSource?.bytes)).toBe('livro original');
    expect(state.originalSource?.fileName).toBe('meu-livro.epub');
  });

  it('substitui a origem ao carregar outro livro, sem misturar evidências', async () => {
    const state = createInitialState();
    await loadFileIntoState(new File(['a'], 'primeiro.epub'), state);
    await loadFileIntoState(new File(['b'], 'segundo.epub'), state);
    expect(state.originalSource?.fileName).toBe('segundo.epub');
    expect(new TextDecoder().decode(state.originalSource?.bytes)).toBe('b');
    expect(state.lastRepairOptions).toBeUndefined();
  });
});
