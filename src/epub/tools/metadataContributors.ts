const DC = 'http://purl.org/dc/elements/1.1/';

function creatorNodes(metadata: Element): Element[] {
  return Array.from(metadata.children).filter((node) => node.localName === 'creator');
}

export function additionalCreators(metadata: Element): string {
  return creatorNodes(metadata).slice(1)
    .map((node) => node.textContent?.trim() ?? '').filter(Boolean).join('\n');
}

export function updateAdditionalCreators(
  doc: Document, metadata: Element, input: string,
): boolean {
  if (!input.trim()) return false;
  if (input.length > 3000) {
    throw new Error('Os créditos adicionais excedem o limite de 3000 caracteres.');
  }
  const names = input.split(/\r?\n/u).map((name) => name.trim()).filter(Boolean);
  if (names.length > 12) throw new Error('Informe no máximo 12 créditos adicionais.');
  if (names.some((name) => name.length > 300)) {
    throw new Error('Cada crédito adicional deve ter no máximo 300 caracteres.');
  }
  const current = creatorNodes(metadata);
  const primary = current[0]?.textContent?.trim();
  if (!primary) {
    throw new Error('Informe um autor principal antes de adicionar créditos secundários.');
  }
  const mainName = primary;
  const unique = new Set(names.map((name) => name.toLocaleLowerCase()));
  if (unique.size !== names.length ||
    names.some((name) => name.toLocaleLowerCase() === mainName.toLocaleLowerCase())) {
    throw new Error('Há autores/créditos duplicados. Confira a lista antes de salvar.');
  }
  const extras = current.slice(1);
  if (extras.length === names.length &&
    extras.every((node, index) => node.textContent?.trim() === names[index])) return false;
  for (const node of extras.slice(names.length)) {
    const id = node.getAttribute('id');
    if (id && Array.from(doc.querySelectorAll('[refines]')).some((ref) =>
      ref.getAttribute('refines') === '#' + id)) {
      throw new Error('Não é possível remover um crédito com função editorial vinculada. ' +
        'O arquivo foi preservado; mantenha o nome ou ajuste o EPUB manualmente.');
    }
  }
  for (const [index, name] of names.entries()) {
    const existing = extras[index];
    if (existing) existing.textContent = name;
    else {
      const creator = doc.createElementNS(DC, 'dc:creator');
      creator.textContent = name;
      metadata.appendChild(creator);
    }
  }
  for (const extra of extras.slice(names.length)) extra.remove();
  return true;
}
