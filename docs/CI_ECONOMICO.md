# Estratégia econômica de CI e homologação

**Atualizada em 12/11/2026.** A política é desenvolver em `dev` e homologar mudanças para `prod` por PR. O objetivo é não desperdiçar minutos de CI sem retirar verificações de risco.

## Gatilhos atuais extraídos do YAML

| Situação | Workflows e verificações |
| --- | --- |
| Push `dev` | `ci.yml`: quality gate **Node 22** (typecheck, lint, Vitest, build, audit). Browser matrix só roda em push `dev` com marcador `[browser]` e arquivos compatíveis com o filtro. |
| PR pronta para `prod` | `ci.yml`: Node **20/22** e EPUBCheck; browser matrix, Calibre, cobertura, Netlify preview e segurança rodam conforme seus próprios filtros/eventos. |
| PR em draft | Jobs pesados de qualidade/browser são pulados pela condição do workflow; **skipped não é aprovação**. |
| Push `prod` | CI completa e demais workflows conforme filtros; `release.yml` pode publicar tag apenas para uma **nova versão SemVer** ainda não publicada. |
| `workflow_dispatch` | Rodar somente a matriz/harness necessário, incluindo emuladores Android/iOS e Kindle Previewer, quando suportado pelo workflow. |
| `schedule` | Auditoria programada de dependências nas agendas dos workflows presentes na branch padrão `prod`. |

**Fonte de verdade:** arquivos versionados em `.github/workflows/`; esta tabela é uma orientação, não substitui os filtros `paths`, `if`, `branches` ou as regras de concorrência.

## Regras econômicas

1. Fazer auditorias somente leitura **sem commit**; alterações em lote reduzem runs canceladas.
2. Evitar abrir PR pronta e sincronizá-la repetidamente durante a implementação. Utilizar draft enquanto o código não estiver apto a homologação.
3. No ciclo rápido, priorizar os testes pertinentes ao diff; não iniciar Android/iOS/Kindle para correções apenas textuais ou documentais.
4. Falhas do runner, downloads e SDKs devem ser investigadas separadamente de bugs do produto. Um job cancelado pela concorrência não conta como verde.
5. Quando a PR estiver pronta, conferir **checks no HEAD exato**, sem reutilizar CI de outro SHA.
6. Após merge, verificar que `prod` foi publicada no deploy de produção, não apenas na prévia HTTPS.
7. O workflow de release não gera uma nova tag enquanto `package.json` mantiver a versão de uma release já existente. Não criar release artificial por ajuste pequeno.

## Qualidade mínima antes do merge

- TypeScript, ESLint, Vitest e build concluídos.
- Node 20/22 aprovados no commit candidato de `prod`.
- EPUBCheck 5.4.0 e testes de navegador/Calibre/cobertura verificados quando correspondem ao risco da mudança e aos gatilhos da PR.
- Fluxos EPUB/PDF alterados cobertos por testes de regressão específicos; para conversão PDF, revisar texto e figuras com uma amostra autorizada.
- Documentação, segurança de arquivos locais e limites de memória preservados.
- Nenhuma alegação de hardware físico sem evidências reais.

A auditoria histórica tinha `97/99` no seu último registro; isso não prova que novas funcionalidades são perfeitas. Ver [Qualidade](QUALIDADE_TESTES.md).

## Ruleset

A auditoria consultada identificou **Protect prod** exigindo apenas os contextos Node 20/22. Outros checks têm grande valor, mas **não devem ser chamados de required checks do ruleset** sem confirmação administrativa. `dev` foi intencionalmente utilizada para commits diretos.

## Histórico

As instruções antigas para uma PR *candidata v2.4.0* e para a PR #32 referiam-se a novembro de 2026 **antes da promoção**, não são fluxo pendente em 12/11. A `v2.5.0` foi a última release anterior à preparação da `v3.0.0`; o código de produção pode conter mudanças pós-release. Consulte [Política de branches](BRANCH_POLICY.md), [Deploy](DEPLOY_OPERACAO.md), [Histórico](../CHANGELOG.md).
