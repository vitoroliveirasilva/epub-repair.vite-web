export function el<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options: {
    className?: string | undefined;
    text?: string | undefined;
    attrs?: Record<string, string> | undefined;
    children?: Array<Node | string | undefined | null | false>;
  } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tagName);

  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;

  for (const [key, value] of Object.entries(options.attrs ?? {})) {
    node.setAttribute(key, value);
  }

  for (const child of options.children ?? []) {
    if (!child) continue;
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }

  return node;
}

export function button(
  text: string,
  className: string,
  onClick: (event: MouseEvent) => void | Promise<void>,
): HTMLButtonElement {
  const node = el('button', { className, text, attrs: { type: 'button' } });
  node.addEventListener('click', (event) => {
    void onClick(event);
  });
  return node;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
