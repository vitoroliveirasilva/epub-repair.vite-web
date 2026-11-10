



export function captureFocusForRerender(root: HTMLElement): () => void {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return () => {};

  const id = active.id;
  const key = active.dataset.focusKey;
  const tag = active.tagName;
  const accessibleLabel = active.getAttribute('aria-label') || active.textContent?.trim();
  const wasInput = active instanceof HTMLInputElement;
  const canSelect = wasInput && /^(?:text|search|email|url|tel|password)$/u.test(active.type);
  const caret = canSelect ? active.selectionStart : null;

  return () => {
    const candidates = Array.from(root.querySelectorAll<HTMLElement>('*'));
    const match = (id && candidates.find((element) => element.id === id)) ||
      (key && candidates.find((element) => element.dataset.focusKey === key)) ||
      (accessibleLabel && candidates.find((element) =>
        element.tagName === tag &&
        (element.getAttribute('aria-label') || element.textContent?.trim()) === accessibleLabel));
    const focusable = match && !match.hasAttribute('disabled') ? match :
      root.querySelector<HTMLElement>('#app-workspace');
    if (!focusable) return;
    focusable.focus({ preventScroll: true });
    if (caret !== null && focusable instanceof HTMLInputElement &&
        /^(?:text|search|email|url|tel|password)$/u.test(focusable.type)) {
      focusable.setSelectionRange(caret, caret);
    }
  };
}
