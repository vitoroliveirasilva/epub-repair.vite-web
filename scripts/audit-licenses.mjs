import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { evaluateLicenseExpression } from './licensePolicy.mjs';

const root = process.cwd();
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
const records = [];
const lockPaths = Object.keys(lock.packages ?? {})
  .filter((p) => p.startsWith('node_modules/'));
let installed = 0;
for (const relative of lockPaths) {
  const file = path.resolve(root, relative, 'package.json');
  if (!file.startsWith(path.join(root, 'node_modules') + path.sep)) continue;
  const locked = lock.packages[relative];
  try {
    const pkg = JSON.parse(await readFile(file, 'utf8'));
    installed++;
    const license = typeof pkg.license === 'string' ? pkg.license.trim()
      : typeof pkg.license?.type === 'string' ? pkg.license.type.trim() : '';
    const checked = evaluateLicenseExpression(license);
    const sameVersion = String(pkg.version) === String(locked.version);
    records.push({
      name: String(pkg.name ?? relative),
      version: String(pkg.version ?? 'unknown'),
      license: license || 'UNKNOWN',
      level: sameVersion ? checked.level : 'blocked',
      reasons: sameVersion ? checked.reasons : ['Versão instalada difere do package-lock'],
    });
  } catch {
    
    
  }
}
records.sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
const blocked = records.filter((row) => row.level === 'blocked');
const review = records.filter((row) => row.level === 'review');
const uninstalled = lockPaths.length - installed;
const report = {
  generatedAt: new Date().toISOString(),
  totalLocked: lockPaths.length,
  installed, uninstalled, blocked: blocked.length,
  requireManualReview: review.length,
  records,
};
console.log('Licenças instaladas: ' + installed +
  ' | lockfile: ' + lockPaths.length + ' | opcionais não instalados: ' + uninstalled);
console.log('Licenças incompatíveis/desconhecidas: ' + blocked.length);
console.log('Licenças que exigem revisão humana: ' + review.length);
for (const p of [...blocked,...review].slice(0,40))
  console.log(' - ' + p.name + '@' + p.version + ': ' + p.license +
    ' [' + p.level + '] ' + p.reasons.join('; '));
const arg = process.argv.indexOf('--json');
if (arg !== -1 && process.argv[arg+1]) {
  const destination = path.resolve(root,process.argv[arg+1]);
  if (!destination.startsWith(root+path.sep))
    throw new Error('Saída JSON deve ficar dentro do repositório');
  await writeFile(destination, JSON.stringify(report,null,2)+'\n');
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    '### Licenças das dependências instaladas (não equivale a parecer jurídico)', '',
    '| Métrica | Quantidade |','| --- | ---: |',
    '| Instaladas | '+installed+' |',
    '| Entradas no lockfile | '+lockPaths.length+' |',
    '| Opcionais não instaladas | '+uninstalled+' |',
    '| SPDX incompatível/desconhecido | '+blocked.length+' |',
    '| SPDX sujeito à revisão legal | '+review.length+' |','',
    'Expressões OR são aprovadas somente quando há uma rota permissiva; expressões AND exigem todas as licenças.',
    'Pacotes não instalados no runner não foram certificados por este relatório.', '',
  ];
  await appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join('\n'));
}
if (process.argv.includes('--enforce') && blocked.length) process.exitCode=1;
