# Cobertura instrumentada de módulos EPUB críticos (E-095)

O workflow `.github/workflows/coverage.yml` roda em cada alteração de código/testes
da `dev` e em PRs para `dev`/`prod`. Ele executa Vitest com provider V8
**fixado na mesma versão do Vitest 4.1.10**, instalado no runner isoladamente
do lockfile principal.

Cinco arquivos críticos têm limiares mínimos individuais, configurados em
`vitest.config.ts`: **45% de linhas, 45% de statements, 25% de branches,
45% de funções**. Valores iniciais deliberadamente conservadores; aumentar
os thresholds com novos testes em vez de diminuir para acomodar falhas.

Arquivos monitorados: `pathUtils`, `rawZipInspector`, `validateNavigation`,
`sanitizeActiveContent` e `preservationAudit`. O workflow falha se
qualquer módulo monitorado cair abaixo do limite e publica as métricas
no resumo do job e no artifact `epub-critical-coverage` por 14 dias.

**Limitações:** é cobertura de fluxo instrumentado, não prova de ausência
de vulnerabilidades, desempenho ou funcionamento em e-readers. Os demais
módulos da aplicação não fazem parte deste gate inicial. A publicação em
produção continua condicionada a testes independentes e revisão de diff.
