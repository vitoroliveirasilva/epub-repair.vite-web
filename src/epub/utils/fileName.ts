export function makeRepairedFileName(originalName: string, suffix = '-k'): string {
  const trimmed = originalName.trim() || 'livro.epub';
  const lastSlash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  const fileName = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
  const withoutTrailingDots = fileName.replace(/[.\s]+$/u, '') || 'livro.epub';
  const index = withoutTrailingDots.toLowerCase().endsWith('.epub')
    ? withoutTrailingDots.length - 5
    : -1;

  if (index >= 0) {
    const base = withoutTrailingDots.slice(0, index) || 'livro';
    return `${base}${suffix}.epub`;
  }

  return `${withoutTrailingDots}${suffix}.epub`;
}

export function deriveTitleFromFileName(fileName: string): string {
  const base = fileName
    .replace(/\.[eE][pP][uU][bB]$/u, '')
    .replace(/[-_]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return base || 'Livro sem título';
}
