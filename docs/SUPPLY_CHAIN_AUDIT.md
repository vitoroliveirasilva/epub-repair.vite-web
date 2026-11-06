# Auditoria da cadeia de suprimentos (E-099)

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
`workflow_dispatch`. A agenda semanal de segunda-feira às 11:15 UTC
entrará em vigor **somente após promoção aprovada para `prod`**.
Não criar merge automático nem alterar produção para ativar cron.

Não incluir SBOMs (com informações detalhadas sobre versões) no
próprio código-fonte; os artefatos controlados ficam nas Actions.
