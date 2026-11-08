import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve('scripts/check-lockfile-provenance.mjs');
async function run(mutator: (lock: Record<string, unknown>) => void) {
  const folder = await mkdtemp(join(tmpdir(), 'lock-test-'));
  const pkg = { version: '2.2.0' };
  const lock: Record<string, unknown> = {
    version: '2.2.0', lockfileVersion: 3,
    packages: {
      '': { version: '2.2.0' },
      'node_modules/test-lib': {
        version: '1.0.0',
        resolved: 'https://registry.npmjs.org/test-lib/-/test-lib-1.0.0.tgz',
        integrity: 'sha512-' + Buffer.alloc(64, 7).toString('base64'),
      },
    },
  };
  mutator(lock);
  const p = join(folder, 'package.json');
  const l = join(folder, 'package-lock.json');
  try {
    await writeFile(p, JSON.stringify(pkg));
    await writeFile(l, JSON.stringify(lock));
    return execFileSync(process.execPath, [script, p, l], { encoding: 'utf8', stdio: 'pipe' });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
describe('E-099: origem de dependências e lockfile', () => {
  it('aceita tarball HTTPS do npm com SHA-512', async () => {
    expect(await run(() => {})).toContain('1 pacotes');
  });
  it('rejeita URL arbitrária mesmo com hash', async () => {
    await expect(run((lock) => {
      const packages = lock.packages as Record<string, Record<string, unknown>>;
      packages['node_modules/test-lib']!.resolved = 'https://example.net/evil.tgz';
    })).rejects.toThrow();
  });
  it('rejeita dependência sem integridade', async () => {
    await expect(run((lock) => {
      const packages = lock.packages as Record<string, Record<string, unknown>>;
      packages['node_modules/test-lib']!.integrity = '';
    })).rejects.toThrow();
  });
  it('audita o package-lock do repositório sem acesso à rede', () => {
    expect(execFileSync(process.execPath, [script], { encoding: 'utf8' }))
      .toMatch(/Lockfile validado: \d+ pacotes/u);
  });
});
