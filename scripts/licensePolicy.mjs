// No third-party parser: strict, deterministic support for simple SPDX
// expressions used by the installed dependency graph. Unknown identifiers
// are NEVER classified as automatically approved.
const permissive = new Set([
  'MIT', 'MIT-0', 'Apache-2.0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause',
  '0BSD', 'CC0-1.0', 'BlueOak-1.0.0', 'Zlib', 'Unlicense',
]);
const reviewOnly = new Set(['MPL-2.0', 'EPL-2.0', 'LGPL-2.1-only', 'LGPL-3.0-only']);

function classification(id) {
  if (permissive.has(id)) return { level: 'approved', reasons: [] };
  if (reviewOnly.has(id)) return { level: 'review', reasons: [id + ': obrigações de licença a revisar'] };
  return { level: 'blocked', reasons: [id + ': licença desconhecida/restritiva'] };
}
function mergeAnd(a, b) {
  if (a.level === 'blocked' || b.level === 'blocked')
    return { level: 'blocked', reasons: [...a.reasons, ...b.reasons] };
  if (a.level === 'review' || b.level === 'review')
    return { level: 'review', reasons: [...a.reasons, ...b.reasons] };
  return { level: 'approved', reasons: [] };
}
function mergeOr(a, b) {
  if (a.level === 'approved' || b.level === 'approved')
    return { level: 'approved', reasons: [] };
  if (a.level === 'review' || b.level === 'review')
    return { level: 'review', reasons: [...a.reasons, ...b.reasons] };
  return { level: 'blocked', reasons: [...a.reasons, ...b.reasons] };
}

/** SPDX simples (AND/OR e parênteses); falha fechada se não reconhecer. */
export function evaluateLicenseExpression(raw) {
  const expression = String(raw ?? '').trim();
  if (!expression) return { level: 'blocked', reasons: ['Identificador de licença ausente'] };
  const tokens = expression.match(/\(|\)|AND|OR|[A-Za-z0-9.+-]+/gu) ?? [];
  if (tokens.join('').length !== expression.replace(/\s+/gu, '').length)
    return { level: 'blocked', reasons: ['Expressão SPDX com token não suportado'] };
  let index = 0;
  function atom() {
    const value = tokens[index++];
    if (!value) throw new Error('SPDX incompleto');
    if (value !== '(') {
      if (value === ')' || value === 'AND' || value === 'OR')
        throw new Error('SPDX sem identificador de licença');
      return classification(value);
    }
    const inner = or();
    if (tokens[index++] !== ')') throw new Error('SPDX com parênteses não balanceados');
    return inner;
  }
  function and() {
    let left = atom();
    while (tokens[index] === 'AND') {
      index++;
      left = mergeAnd(left, atom());
    }
    return left;
  }
  function or() {
    let left = and();
    while (tokens[index] === 'OR') {
      index++;
      left = mergeOr(left, and());
    }
    return left;
  }
  try {
    const answer = or();
    if (index !== tokens.length) throw new Error('SPDX contém tokens não processados');
    return answer;
  } catch (err) {
    return { level: 'blocked', reasons: [
      err instanceof Error ? err.message : 'Erro ao analisar SPDX',
    ] };
  }
}
