import { readFile } from 'node:fs/promises';

export function validateBranchPolicy(rulesets, details, releaseWorkflow) {
  const errors = [];
  const prod = rulesets.filter((rule) =>
    rule.name === 'Protect prod' &&
    rule.target === 'branch' &&
    rule.enforcement === 'active');
  if (prod.length !== 1) {
    errors.push('Precisa existir exatamente um ruleset ativo Protect prod.');
  }
  const policy = details;
  if (!policy || policy.enforcement !== 'active' ||
      !policy.conditions?.ref_name?.include?.includes('refs/heads/prod')) {
    errors.push('Ruleset não protege refs/heads/prod.');
  }
  if (policy?.conditions?.ref_name?.include?.includes('refs/heads/dev')) {
    errors.push('Proteção dev mudou: revisar compatibilidade com commits diretos.');
  }
  const types = new Set((policy?.rules ?? []).map((rule) => rule.type));
  for (const type of ['deletion','non_fast_forward','pull_request',
    'required_status_checks']) {
    if (!types.has(type)) errors.push('Falta regra de produção: ' + type);
  }
  const checks = (policy?.rules ?? []).find(
    (rule) => rule.type === 'required_status_checks')?.parameters;
  if (checks?.strict_required_status_checks_policy !== true) {
    errors.push('Checks da prod precisam ser estritos.');
  }
  const contexts = (checks?.required_status_checks ?? []).map(
    (value) => value.context);
  for (const required of ['Quality gate / Node 20.x',
    'Quality gate / Node 22.x']) {
    if (!contexts.includes(required)) errors.push('Check ausente: ' + required);
  }
  const releaseGuards = [
    /workflows:\s*\["CI"\]/u,
    /branches:\s*\[prod\]/u,
    /workflow_run\.conclusion\s*==\s*'success'/u,
    /workflow_run\.event\s*==\s*'push'/u,
    /current_sha.*SOURCE_SHA/u,
    /gh release create/u,
    /pkg\.version !== lock\.version/u,
  ];
  for (const rule of releaseGuards) {
    if (!rule.test(releaseWorkflow)) {
      errors.push('Automação de releases perdeu guarda: ' + rule.source);
    }
  }
  return errors;
}

async function githubRead(path) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo || !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/iu.test(repo)) {
    throw new Error('GITHUB_REPOSITORY inválido.');
  }
  const result = await fetch('https://api.github.com/repos/' + repo + path, {
    headers: {
      Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28',
      ...(token ? {Authorization:'Bearer ' + token}:{}),
    },
    signal:AbortSignal.timeout(15000),
  });
  if (!result.ok) {
    throw new Error('GitHub REST '+result.status+' em '+path);
  }
  return await result.json();
}

async function run() {
  const fixture = process.argv[2] === '--fixture' ? process.argv[3] : undefined;
  const model = fixture
    ? JSON.parse(await readFile(fixture,'utf8'))
    : {rulesets:await githubRead('/rulesets')};
  const active = model.rulesets.find((rule) => rule.name === 'Protect prod' &&
    rule.target === 'branch' && rule.enforcement === 'active');
  const details = fixture ? model.details :
    active ? await githubRead('/rulesets/' + active.id) : null;
  const releaseWorkflow = fixture ? model.releaseWorkflow :
    await readFile('.github/workflows/release.yml','utf8');
  const errors = validateBranchPolicy(model.rulesets,details,releaseWorkflow);
  if (errors.length) {
    for (const error of errors) process.stderr.write('FAIL '+error+'\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    'PASS E-098 ruleset ativo Protect prod: PR, checks Node20/22, '+
    'strict, sem deleção/force push; release só após CI push prod. '+
    'dev direta por decisão do projeto.\n');
}

if (process.argv[1]?.endsWith('/audit-branch-policy.mjs') ||
    process.argv[1] === 'scripts/audit-branch-policy.mjs') {
  await run();
}
