import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLicenseExpression as evaluate } from '../scripts/licensePolicy.mjs';

test('SPDX: MIT OR GPL escolhe a opção MIT, sem sinalizar GPL obrigatória', () => {
  assert.equal(evaluate('(MIT OR GPL-3.0-or-later)').level,'approved');
});
test('SPDX: MIT AND Zlib requer ambos, ambos conhecidos', () => {
  assert.equal(evaluate('(MIT AND Zlib)').level,'approved');
});
test('SPDX: MPL requer revisão, não inventa aprovação jurídica', () => {
  assert.equal(evaluate('MPL-2.0').level,'review');
});
test('SPDX: GPL exclusiva é barrada, sem falso negativo', () => {
  assert.equal(evaluate('GPL-3.0-only').level,'blocked');
  assert.equal(evaluate('MIT AND GPL-3.0-only').level,'blocked');
});
test('SPDX: strings desconhecidas ou malformadas falham fechadas', () => {
  for (const input of ['', '()', 'MIT OR', 'MIT/X', 'MIT WITH Classpath-exception-2.0', 'MIT OR ('])
    assert.equal(evaluate(input).level,'blocked', input);
});
test('SPDX: expressões parênteses complexos e precedência', () => {
  assert.equal(evaluate('MIT AND (BSD-3-Clause OR GPL-3.0-only)').level,'approved');
  assert.equal(evaluate('MPL-2.0 OR GPL-3.0-only').level,'review');
});
