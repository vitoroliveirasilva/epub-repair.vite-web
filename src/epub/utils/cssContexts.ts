/** Posições de tokens CSS fora de comentários e strings editoriais. */
export function cssCodePosition(source: string): (offset: number) => boolean {
  const ignored: Array<[number, number]> = [];
  for (let i = 0; i < source.length;) {
    const start = i;
    const char = source[i] ?? '';
    if (char === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2);
      i = close < 0 ? source.length : close + 2;
      ignored.push([start, i]);
      continue;
    }
    if (char === '"' || char === "'") {
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') { i = Math.min(i + 2, source.length); continue; }
        if (source[i++] === char) break;
      }
      ignored.push([start, i]);
      continue;
    }
    if (char === '\\') { i = Math.min(i + 2, source.length); continue; }
    i += 1;
  }
  // Busca binária: suporta consultas em qualquer ordem sem custo quadrático.
  return (offset: number): boolean => {
    let low = 0;
    let high = ignored.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (ignored[middle]![1] <= offset) low = middle + 1;
      else high = middle;
    }
    return low >= ignored.length || ignored[low]![0] > offset;
  };
}
