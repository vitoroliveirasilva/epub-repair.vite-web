import { readFileSync, appendFileSync } from 'node:fs';
const report = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
const rows = Object.entries(report)
  .filter(([name]) => name !== 'total')
  .map(([name, metrics]) => ({
    file: name.replace(process.cwd() + '/', ''),
    lines: metrics.lines.pct,
    branches: metrics.branches.pct,
    functions: metrics.functions.pct,
    statements: metrics.statements.pct,
  }));
const table = [
  '### Cobertura instrumentada de módulos EPUB críticos',
  '',
  '| Arquivo | Linhas | Branches | Funções | Statements |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...rows.map((row) =>
    `| ${row.file} | ${row.lines}% | ${row.branches}% | ${row.functions}% | ${row.statements}% |`),
  '',
  'Escopo: somente os cinco arquivos indicados em vitest.config.ts. ' +
    'Estes limiares não representam cobertura de todo o repositório.',
  '',
].join('\n');
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table);
