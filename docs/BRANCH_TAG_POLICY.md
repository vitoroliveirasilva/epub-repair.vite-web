# Política de branches, regras e release (E-098)

## O que existe, confirmado em 06/11/2026

O ruleset **Protect prod** está ativo, id `18459289`,
aplicado exclusivamente a `refs/heads/prod`, e exige:

- PR para modificar produção;
- bloqueio de exclusão e force push;
- checks estritos `Quality gate / Node 20.x` e
  `Quality gate / Node 22.x`.

A `dev` está **propositadamente aberta para commits diretos**, pois
o processo de desenvolvimento foi solicitado assim. Isso **não significa**
que a branch de desenvolvimento esteja protegida contra force push,
exclusão ou alterações sem revisão; esses riscos são conhecidos.

O workflow `.github/workflows/release.yml` é disparado só após
`CI` aprovada por `push` na `prod`, verifica a igualdade das
versões do package e lockfile, exige SemVer estável e faz release
`vX.Y.Z` apenas se o SHA aprovado for o HEAD atual da produção.

`scripts/audit-branch-policy.mjs` valida a configuração publicada
pelo GitHub e o código do release, e `.github/workflows/branch-policy.yml`
executa esta auditoria em pushes e PRs. A verificação é **somente
leitura**, não concede permissões administrativas nem contorna branch
protection.

## Limites importantes

- O conector GitHub usado nesta execução não tem permissão
  `Administration`; consultar a proteção tradicional retorna
  HTTP 403. Foi possível consultar a API pública de **rulesets**
  e inspecionar o ruleset ativo.
- A `dev` NÃO recebeu proteção nova. A escolha preserva o fluxo de
  trabalho, mas commits diretos continuam possíveis.
- Tags continuam sujeitas às permissões normais da conta, sem
  garantia de imutabilidade via ruleset de tags. O workflow de release
  é protegido contra publicação indevida, mas outros usuários com
  acesso de escrita poderiam criar tags manualmente.
- Para exigir imutabilidade de todas as tags, um administrador deve
  adicionar um ruleset com target `tag`; a CI não substitui
  restrições administrativas de servidor.

O item pode ser dado por **revisado/documentado/verificado na CI**,
não por "dev protegida": essa última afirmação seria falsa.

## Auditoria real aprovada (execução 18)

A [CI 42217527838](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42217527838)
foi executada no GitHub com `GITHUB_TOKEN` e retornou **PASS E-098**.
Ela verificou o ruleset ativo `Protect prod`, correspondência exata
`refs/heads/prod`, `deletion` + `non_fast_forward`, exigência
de PR, checks estritos Node 20/22 e condições de versão/CI das tags
geradas pelo release.

O item E-098 está concluído **como revisão automatizada da política
que foi escolhida e implantada**, não como implantação de nova proteção
na `dev`. A `dev` continua propositalmente aberta. Criar um
ruleset contra exclusão/force push de tags existentes requer permissões
administrativas ausentes da conexão atual; a CI detecta desvios do
caminho oficial de release, mas não substitui restrição de servidor.
