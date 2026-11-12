# Política atual de branches e promoção

**Verificada em 12/11/2026:** repositório `vitoroliveirasilva/epub-repair.vite-web` com duas branches listadas pela API GitHub: `dev` e `prod`. A `prod` hospeda a aplicação pública; a `dev` recebe desenvolvimento.

## Regras observadas

- Ruleset ativo: **Protect prod**, ID `18459289`, publicado para a branch `prod`.
- Auditoria anterior da API identificou bloqueios de exclusão/force push, requisito de PR e checks estritos **Quality gate / Node 20.x** e **Quality gate / Node 22.x** para `prod`.
- A API pública de rulesets continua listando **Protect prod** em 12/11/2026. Essa consulta não permite afirmar que todos os controles administrativos/legacy protection sejam visíveis ou imutáveis.
- A lista de branches consultada em 12/11/2026 contém **apenas `dev` e `prod`**. Dependabot pode criar branches temporárias futuras, dependendo da configuração e das regras de segurança.
- As PRs #43–#54 foram integradas em `prod`; em 12/11/2026 não havia PRs abertas no resultado consultado.
- A tag mais recente confirmada é `v2.5.0`. A produção recebeu commits posteriores sem gerar outra release versionada.

## Fluxo recomendado

1. Desenvolver e commitar somente em **`dev`**, sem alterações diretas em `prod`.
2. Revisar o diff, evitar dados privados e executar testes apropriados ao escopo.
3. Abrir **PR `dev` → `prod`**, preferencialmente quando as mudanças relacionadas estiverem consolidadas; PR em draft não equivale a homologação.
4. Conferir no commit candidato os checks obrigatórios Node 20/22 e, quando acionados/pertinentes, EPUBCheck, browsers, cobertura, Calibre, segurança e Netlify HTTPS.
5. Obter a aprovação de publicação prevista pelo responsável e realizar merge sem force push.
6. Verificar a CI e o deploy **no commit final de `prod`**; não afirmar que preview é produção.
7. Registrar em `CHANGELOG.md` alterações de produto posteriores à última tag. Versionar pacote e notas de release apenas quando decidir lançar uma versão nova.

## Releases e tags

`.github/workflows/release.yml` publica a tag `vX.Y.Z` apenas após sucesso da CI no push em `prod`, quando o SHA validado ainda é HEAD e as versões de `package.json` e `package-lock.json` coincidem. Tag/release já existente não é republicada. O workflow por si só **não impõe imutabilidade de todas as tags via ruleset**.

Para impedir criação ou substituição manual indevida de tags por contas com permissão de escrita, o administrador precisa revisar um ruleset com alvo `tag`. A existência de um workflow protegido não substitui a regra no servidor.

## Segurança operacional

- Não apagar `dev` nem `prod`, não forçar push e não sobrescrever tags históricas.
- Para atualizar dependências, revisar PRs temporárias individualmente; evitar promover automaticamente mudanças major sem testes.
- Verificar as regras em **Settings → Rules → Rulesets** antes de alterar proteção ou declarar que algo está proibido pela plataforma.
- A integração GitHub usada na auditoria anterior não possuía permissão administrativa para ler alguns endpoints antigos (`403`); não inferir “branch desprotegida” apenas por esse erro.
- Alterações documentais não exigem release/tag nem mudança de versão do pacote.

## Registro de contexto histórico

Em 05/11/2026, o repositório tinha produção v2.2.0; em 08/11, v2.3.0; em 10/11, a candidata v2.4.0 foi promovida; em 11/11, foi publicada a [v2.5.0](https://github.com/vitoroliveirasilva/epub-repair.vite-web/releases/tag/v2.5.0). Entre 11 e 12/11 foram incorporadas PRs #43–#54. Documentos `RELEASE_2_3_0_HOMOLOGACAO.md` e `RELEASE_2_4_0_CANDIDATA.md` registram procedimentos históricos, não pedidos de merge ainda pendentes.

Links: [CI econômica](CI_ECONOMICO.md) · [Deploy](DEPLOY_OPERACAO.md) · [Política de tags](BRANCH_TAG_POLICY.md) · [Estado atual](ESTADO_ATUAL.md).
