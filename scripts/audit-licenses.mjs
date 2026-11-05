import { readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
const records = [];
for (const relative of Object.keys(lock.packages ?? {})) {
  if (!relative.startsWith('node_modules/')) continue;
  const file = path.resolve(root, relative, 'package.json');
  if (!file.startsWith(path.join(root, 'node_modules') + path.sep)) continue;
  try {
    const pkg = JSON.parse(await readFile(file, 'utf8'));
    const license = typeof pkg.license === 'string' ? pkg.license.trim()
      : typeof pkg.license?.type === 'string' ? pkg.license.type.trim() : '';
    records.push({
      name: String(pkg.name ?? relative),
      version: String(pkg.version ?? 'unknown'),
      license: license || 'UNKNOWN',
    });
  } catch {
    // Pacotes opcionais de outra plataforma podem constar do lock sem instalação.
  }
}
records.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const unknown = records.filter((p) => p.license === 'UNKNOWN');
const potentiallyRestrictive = records.filter((p) =>
  /(?:^|[^a-z])(?:AGPL|GPL)(?:-|\b)/iu.test(p.license),
);
console.log(`Licenças auditadas: ${records.length} pacotes instalados`);
console.log(`Sem licença explícita no package.json: ${unknown.length}`);
console.log(`Licenças que exigem revisão manual: ${potentiallyRestrictive.length}`);
for (const item of [...unknown, ...potentiallyRestrictive].slice(0, 40)) {
  console.log(`- ${item.name}@${item.version}: ${item.license}`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    '### Revisão de licenças instaladas',
    '',
    '| Métrica | Quantidade |',
    '| --- | ---: |',
    `| Pacotes instalados | ${records.length} |`,
    `| Licença desconhecida | ${unknown.length} |`,
    `| Licença que exige revisão | ${potentiallyRestrictive.length} |`,
    '',
    'Relatório informativo. Licenças SPDX com expressões OR/AND exigem revisão jurídica.',
    '',
  ];
  await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
}
