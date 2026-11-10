# Política de branches, CI e releases

Estado consultado em 05/11/2026 por API do GitHub, repositório
`vitoroliveirasilva/epub-repair.vite-web`.

## Evidências atuais

- Ruleset **Protect prod** (ID `18459289`) ativo em `refs/heads/prod`.
- O ruleset proíbe exclusão e reescrita de histórico de `prod`.
- Para `prod`, exige PR e verificações **Quality gate / Node 20.x**
  e **Quality gate / Node 22.x**, com política estrita de atualização.
- O job **EPUBCheck 5.4.0** existe na CI, mas **não está listado como
  status obrigatório do ruleset de `prod`**.
- A enumeração pública de rulesets retornou apenas **Protect prod**:
  não foi possível comprovar proteção de `dev` por ruleset.
- A consulta específica a endpoints `branches/{branch}/protection`
  retornou `403 Resource not accessible by integration` para ambas
  as branches. Portanto, a ausência de proteção legada não pode ser
  afirmada apenas a partir desta consulta.
- A política de tags não foi confirmada por ruleset de tags.
  Este estado de proteção foi observado em 05/11/2026; desde então,
  a `prod` recebeu a release `v2.3.0` em 08/11/2026.
  A candidata `v2.4.0` permanece exclusivamente na `dev`.

## Política operacional observada

Commits de desenvolvimento são feitos **somente em `dev`**, em nome do usuário
conectado. Não empurrar automaticamente `dev` para `prod`. Antes de criar
PR ou release, revisar o diff, obter aprovação explícita, executar CI
completa, EPUBCheck e homologação de EPUBs reais.

## Proposta de proteção para aprovação humana

1. Proibir force-push e exclusão de `dev` sem impor PR obrigatório, pois
   o fluxo solicitado aceita commits diretos em `dev`.
2. Adicionar **EPUBCheck 5.4.0** aos status obrigatórios de `prod`
   somente após confirmar o nome de contexto estável e validar um PR.
3. Criar política específica para tags `v*` e releases, sem
   sobrescrever tags históricas.
4. Conferir as permissões efetivas em **Settings > Rules > Rulesets**,
   pois as rotas de branch protection da integração não são legíveis.

**Nenhuma regra de branch ou tag foi alterada nesta auditoria.** E-098
permanece parcial até as proteções de `dev` e tags serem realmente
confirmadas ou aplicadas com aprovação.

## Organização de branches verificada em 10/11/2026

As branches permanentes do projeto são `dev` e `prod`. Existem também
cinco branches temporárias de dependências abertas pelo Dependabot:
`dependabot/npm_and_yarn/frontend-tooling-58b15aa916`,
`dependabot/npm_and_yarn/vitest-5.1.0`,
`dependabot/npm_and_yarn/jsdom-31.0.0`,
`dependabot/github_actions/actions/setup-java-6` e
`dependabot/github_actions/actions/upload-artifact-7`.

As PRs #34, #35, #36, #38 e #39 ainda estão abertas, com base `prod`.
A PR #37 liga `dev` a `prod` e permanece rascunho até homologação e
aprovação explícita. Não encerrar essas PRs de dependências ou apagar suas
branches enquanto houver alterações não examinadas, sobretudo mudanças
major. Nenhuma atualização de dependências é promovida automaticamente.

O arquivo `.github/dependabot.yml` da `dev` passa a escolher
`target-branch: dev` para *atualizações de versão*. O Dependabot lê sua
configuração na branch padrão `prod`, portanto a mudança só entra em vigor
depois de ser incorporada à `prod` por uma PR homologada. PRs existentes
não mudam de destino automaticamente. **Atualizações de segurança** do
Dependabot continuam visando a branch padrão por regra do GitHub.

Fluxo seguro para manter somente duas branches de longa duração:
1. Receber código funcional exclusivamente em `dev`.
2. Analisar atualizações de dependências individualmente, testar e aceitar
   na `dev` ou fechar motivadamente a PR; só então apagar a branch
   temporária, quando não houver trabalho necessário não incorporado.
3. Publicar de `dev` para `prod` somente pela PR de release pronta
   para revisão e com todos os checks de homologação obrigatórios.
4. Em GitHub Settings, considerar a opção de exclusão automática de branches
   após merge, preservando `dev` e `prod` por proteção. Isso não impede
   branches temporárias futuras do Dependabot.
5. Se a exigência for possuir literalmente só duas branches em todos os
   momentos, desativar as PRs automáticas de *versão*; isso reduz
   monitoramento de dependências e não elimina as branches geradas por
   atualizações de segurança habilitadas.

Esta rodada não fez merge, não fechou PR e não excluiu branches.
