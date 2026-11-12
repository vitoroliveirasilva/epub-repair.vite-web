# Auditoria da cadeia de suprimentos (E-099)

> **Atualização 12/11/2026:** os workflows de supply chain e de auditoria já estão na branch padrão `prod`. A antiga condição “entrará em vigor somente após promoção para prod” foi satisfeita. Disponibilidade de agendamento e sucesso de uma execução são coisas diferentes: confira o histórico real em GitHub Actions antes de afirmar que o scanner executou. Ver [CI econômica](CI_ECONOMICO.md) e [Deploy](DEPLOY_OPERACAO.md).

Este repositório possui duas defesas independentes para dependências JavaScript:

1. CI e `npm audit` + atualização automática Dependabot semanal.
2. Workflow `.github/workflows/supply-chain.yml`: relatório SBOM em **dois
   formatos padronizados**, CycloneDX e SPDX, inventário de licenças com política
   conservadora, e inteligência de vulnerabilidades **OSV Scanner v2**,
   que complementa, mas não substitui, o `npm audit`.

O relatório `scripts/audit-licenses.mjs --enforce --json ./licenses-inventory.json`
inspeciona bibliotecas instaladas e compara versões com `package-lock.json`.
Expressões `OR` permitem selecionar a rota permissiva, enquanto `AND`
exige todas as licenças. Licenças desconhecidas e GPL obrigatória reprovam.
Licenças que exigem avaliação humana, por exemplo **MPL-2.0**, ficam
explicitamente marcadas e NÃO significam aprovação jurídica. Dependências
opcionais não instaladas no ambiente CI são contabilizadas separadamente,
sem falsa afirmação de conformidade.

Os SBOMs e o relatório de licenças ficam como artifact do job por 30 dias.
A auditoria OSV é independente e reprova vulnerabilidades conhecidas; não
comprova ausência de falhas inéditas.

**Ativação da periodicidade:** a branch padrão é **`prod`**, e GitHub Actions
executa cron **somente se o workflow estiver na branch padrão**. Na `dev` a
verificação é executada por push e PR, e também pode ser disparada por
`workflow_dispatch`. O agendamento semanal de segunda-feira às 11:15 UTC está configurado no workflow da branch padrão `prod`. Não é necessário promover um workflow antigo para disponibilizar essa configuração. A execução efetiva de cada cron depende da plataforma GitHub Actions e deve ser confirmada no histórico.

Não incluir SBOMs (com informações detalhadas sobre versões) no
próprio código-fonte; os artefatos controlados ficam nas Actions.

## Primeira execução comprovada

[Run 42151432158](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42151432158)
concluiu **SBOM + SPDX license policy + OSV** com sucesso. O workflow tem
schedule semanal configurado, mas **o GitHub executa esse schedule somente
no branch padrão**, que continua sendo `prod`. Na `dev`, a CI de
segurança roda por push/PR e pode ser disparada manualmente. O scanner
não detectou falha conhecida na base deste commit; isso não é garantia
de segurança irrestrita.
