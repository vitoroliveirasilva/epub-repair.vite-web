# Cobertura instrumentada de módulos EPUB críticos (E-095)

O workflow `.github/workflows/coverage.yml` roda em cada alteração de código/testes
da `dev` e em PRs para `dev`/`prod`. Ele executa Vitest com provider V8
**fixado na mesma versão do Vitest 4.1.12 instalada pelo lockfile**, instalado no runner isoladamente
do lockfile principal.

Cinco arquivos críticos têm limiares mínimos individuais, configurados em
`vitest.config.ts`: **88% de linhas, 85% de statements, 70% de branches,
82% de funções**. Os valores foram elevados após medição da CI
[42142342105](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42142342105):
a menor cobertura entre módulos foi 90,41% de linhas, 74,73% de branches
e 85,71% de funções. Aumentar os thresholds com novos testes.

Arquivos monitorados: `pathUtils`, `rawZipInspector`, `validateNavigation`,
`sanitizeActiveContent` e `preservationAudit`. O workflow falha se
qualquer módulo monitorado cair abaixo do limite e publica as métricas
no resumo do job e no artifact `epub-critical-coverage` por 14 dias.

**Limitações:** é cobertura de fluxo instrumentado, não prova de ausência
de vulnerabilidades, desempenho ou funcionamento em e-readers. Os demais
módulos da aplicação não fazem parte deste gate inicial. A publicação em
produção continua condicionada a testes independentes e revisão de diff.
