import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const manifestPath = path.resolve(process.argv[2] ?? 'package.json');
const lockPath = path.resolve(process.argv[3] ?? 'package-lock.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const lock = JSON.parse(await readFile(lockPath, 'utf8'));
const errors = [];
if (manifest.version !== lock.version || manifest.version !== lock.packages?.['']?.version) {
  errors.push('Versões de package.json e package-lock.json são divergentes.');
}
if (lock.lockfileVersion !== 3) errors.push('Formato do lockfile não é v3.');

let checked = 0;
for (const [name, item] of Object.entries(lock.packages ?? {})) {
  if (!name.startsWith('node_modules/')) continue;
  checked += 1;
  if (item.link === true || typeof item.integrity !== 'string' ||
      !/^(?:sha512|sha384)-[A-Za-z0-9+/]+={0,2}$/u.test(item.integrity)) {
    errors.push(name + ': hash ausente/fraco ou link de instalação inesperado.');
  }
  let url;
  try { url = new URL(item.resolved); } catch { url = undefined; }
  if (!url || url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org' ||
      url.port || url.username || url.password || !url.pathname.endsWith('.tgz')) {
    errors.push(name + ': origem de pacote exige revisão manual.');
  }
}
if (!checked) errors.push('Lockfile sem dependências.');
if (errors.length) {
  throw new Error('Integridade do lockfile:\n' + errors.slice(0, 25).join('\n'));
}
console.log('Lockfile validado: ' + checked + ' pacotes com origem npm HTTPS e hash forte.');
