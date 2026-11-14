const DC = 'http://purl.org/dc/elements/1.1/';
const OPF = 'http://www.idpf.org/2007/opf';

function creatorNodes(metadata: Element): Element[] {
  return Array.from(metadata.children).filter((node) => node.localName === 'creator');
}

function protectedCredit(doc: Document, node: Element): boolean {
  const id = node.getAttribute('id');
  if (id && Array.from(doc.getElementsByTagName('*')).some((entry) =>
    entry.getAttribute('refines') === '#' + id)) return true;
  return Array.from(node.attributes).some((attr) =>
    (attr.localName === 'role' || attr.localName === 'file-as') &&
    (attr.namespaceURI === OPF || attr.prefix === 'opf' || !attr.namespaceURI));
}


function readCreatorRole(metadata: Element, node: Element): string {
  const direct = node.getAttributeNS(OPF, 'role') ?? node.getAttribute('opf:role') ??
    node.getAttribute('role');
  if (direct?.trim()) return direct.trim();
  const id = node.getAttribute('id');
  if (!id) return '';
  const meta = Array.from(metadata.children).find((entry) =>
    entry.localName === 'meta' && entry.getAttribute('property') === 'role' &&
    entry.getAttribute('refines') === '#' + id);
  return meta?.textContent?.trim() ?? '';
}

export function additionalCreatorRoles(metadata: Element): string {
  return creatorNodes(metadata).slice(1)
    .map((node) => readCreatorRole(metadata, node)).join('\n');
}

function unusedId(doc: Document, base: string): string {
  const all = new Set(Array.from(doc.getElementsByTagName('*'))
    .map((node) => node.getAttribute('id')));
  let id = base;
  let index = 2;
  while (all.has(id)) id = base + '-' + index++;
  return id;
}

export function updateAdditionalCreatorRoles(
  doc: Document, metadata: Element, input: string, epub3: boolean,
): boolean {
  if (!input.trim()) return false;
  if (input.length > 500) {
    throw new Error('Os códigos de função editorial excedem o limite permitido.');
  }
  const credits = creatorNodes(metadata).slice(1);
  const roles = input.split(/\r?\n/u).map((item) => item.trim().toLowerCase());
  if (roles.length > credits.length) {
    throw new Error('A lista de funções excede o número de créditos adicionais.');
  }
  if (roles.some((role) => role && !/^[a-z]{3}$/u.test(role))) {
    throw new Error('Use códigos MARC de três letras, como aut, edt, trl ou ill.');
  }
  let changed = false;
  for (const [index, node] of credits.entries()) {
    const role = roles[index] ?? '';
    if (!role || readCreatorRole(metadata, node) === role) continue;
    if (epub3) {
      const legacyNamespaceRole = node.hasAttributeNS(OPF, 'role') ||
        node.hasAttribute('opf:role');
      const legacyUnqualifiedRole = node.hasAttribute('role');
      if (legacyNamespaceRole) node.setAttributeNS(OPF, 'opf:role', role);
      if (legacyUnqualifiedRole) node.setAttribute('role', role);
      let id = node.getAttribute('id');
      let ref = id ? Array.from(metadata.children).find((entry) =>
        entry.localName === 'meta' && entry.getAttribute('property') === 'role' &&
        entry.getAttribute('refines') === '#' + id) : undefined;
      if (!ref && !legacyNamespaceRole && !legacyUnqualifiedRole) {
        if (!id) {
          id = unusedId(doc, 'epub-repair-credit');
          node.setAttribute('id', id);
        }
        ref = doc.createElementNS(OPF, 'meta');
        ref.setAttribute('property', 'role');
        ref.setAttribute('refines', '#' + id);
        metadata.appendChild(ref);
      }
      if (ref) {
        ref.setAttribute('scheme', 'marc:relators');
        ref.textContent = role;
      }
    } else {
      node.setAttributeNS(OPF, 'opf:role', role);
    }
    changed = true;
  }
  return changed;
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
  const normalize = (name: string): string => name.toLocaleLowerCase();
  const unique = new Set(names.map(normalize));
  if (unique.size !== names.length ||
    names.some((name) => normalize(name) === normalize(primary))) {
    throw new Error('Há autores/créditos duplicados. Confira a lista antes de salvar.');
  }

  const extras = current.slice(1);
  if (extras.length === names.length &&
    extras.every((node, index) => node.textContent?.trim() === names[index])) return false;

  const originalByName = new Map<string, Element>();
  for (const node of extras) {
    const key = normalize(node.textContent?.trim() ?? '');
    if (key && originalByName.has(key)) {
      throw new Error('Os créditos originais possuem nomes duplicados. ' +
        'A associação segura de autores exige revisão manual.');
    }
    if (key) originalByName.set(key, node);
  }
  const kept = new Set(names.map(normalize));
  for (const old of extras) {
    const oldName = normalize(old.textContent?.trim() ?? '');
    if (!kept.has(oldName) && protectedCredit(doc, old)) {
      throw new Error('O crédito "' + (old.textContent?.trim() ?? '') +
        '" contém função editorial vinculada ou refinamentos vinculados. ' +
        'Mantenha o crédito ou edite seus vínculos com uma ferramenta especializada.');
    }
  }

  const reordered: Element[] = names.map((name) => {
    const existing = originalByName.get(normalize(name));
    if (existing) {
      existing.textContent = name;
      return existing;
    }
    const created = doc.createElementNS(DC, 'dc:creator');
    created.textContent = name;
    return created;
  });
  const last = extras[extras.length - 1];
  const anchor = last ? last.nextSibling : current[0]?.nextSibling ?? null;
  for (const old of extras) old.remove();
  for (const node of reordered) metadata.insertBefore(node, anchor);
  return true;
}
