// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const folder = mkdtempSync(join(tmpdir(), 'epub-av-test-'));
const book = join(folder, 'obra com espaços #&!.epub');
const binary = join(folder, 'clamscan-mock.cjs');
const log = join(folder, 'args.json');
const script = resolve('scripts/scan-epub-av.mjs');
writeFileSync(book, 'EPUB de teste sintético, sem dados privados.');
writeFileSync(binary,
  'const fs = require("node:fs");\n' +
  'fs.writeFileSync(process.env.MOCK_ARGS_LOG, JSON.stringify(process.argv.slice(2)));\n' +
  'process.exit(Number(process.env.MOCK_EXIT || 0));\n');
afterAll(() => rmSync(folder, { recursive: true, force: true }));

function run(path: string, code = 0, executable = binary) {
  return spawnSync(process.execPath, [script, path], {
    encoding: 'utf8',
    env: { ...process.env, CLAMSCAN_BIN: executable,
      MOCK_EXIT: String(code), MOCK_ARGS_LOG: log },
  });
}

describe('E-059: ClamAV externo opcional sem upload e sem editar o livro', () => {
  it('passa caminho com espaços e caracteres especiais como argumento literal', () => {
    const original = readFileSync(book);
    const result = run(book);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/NÃO garante ausência/u);
    expect(JSON.parse(readFileSync(log, 'utf8'))).toEqual(['--no-summary', book]);
    expect(readFileSync(book)).toEqual(original);
  });

  it('distingue resultado positivo de erro operacional do scanner', () => {
    const detected = run(book, 1);
    expect(detected.status).toBe(1);
    expect(detected.stderr).toMatch(/assinatura suspeita/u);
    const operationalError = run(book, 2);
    expect(operationalError.status).toBe(2);
    expect(operationalError.stderr).toMatch(/inconclusiva/u);
  });

  it('sem clamscan instalado resulta inconclusivo, nunca parecer limpo', () => {
    const result = run(book, 0, join(folder, 'scanner-ausente'));
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/indisponível/u);
  });

  it('bloqueia arquivo ausente, diretório e extensões não EPUB antes de executar scanner', () => {
    for (const path of [join(folder, 'ausente.epub'), folder, join(folder, 'outro.txt')]) {
      const result = run(path);
      expect(result.status).toBe(64);
    }
  });
});
