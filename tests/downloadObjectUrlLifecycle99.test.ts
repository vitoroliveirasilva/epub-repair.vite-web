// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from '../src/ui/dom';

describe('E-082: ObjectURL seguro em navegadores Safari/WebKit', () => {
  let urlCounter = 0;
  let restoreClick = () => {};
  const create = vi.fn<() => string>();
  const revoke = vi.fn<(url: string) => void>();
  beforeEach(() => {
    vi.useFakeTimers();
    urlCounter = 0;
    create.mockImplementation(() => 'blob:test-' + (++urlCounter));
    revoke.mockReset();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true,
      writable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true,
      writable: true, value: revoke });
    const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    restoreClick = () => spy.mockRestore();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    restoreClick();
    create.mockReset();
    revoke.mockReset();
  });
  it('não revoga antes do Safari iniciar, mas libera no timeout e remove o link', () => {
    downloadBlob(new Blob(['book']), 'Livro.epub');
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    expect(document.querySelector('a[download="Livro.epub"]')).toBeNull();
    vi.advanceTimersByTime(60_000);
    expect(revoke).toHaveBeenCalledWith('blob:test-1');
    expect(revoke).toHaveBeenCalledTimes(1);
  });
  it('pagehide libera imediatamente sem dupla revogação', () => {
    downloadBlob(new Blob(['a']), '1.epub');
    downloadBlob(new Blob(['b']), '2.epub');
    window.dispatchEvent(new Event('pagehide'));
    expect(revoke.mock.calls.map(([url]) => url)).toEqual(
      expect.arrayContaining(['blob:test-1', 'blob:test-2']),
    );
    expect(revoke).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_000);
    expect(revoke).toHaveBeenCalledTimes(2);
  });
});
