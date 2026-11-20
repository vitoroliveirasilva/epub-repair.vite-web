# Índice e política de manutenção da documentação

**Data de referência:** 12/11/2026 · **Idioma editorial:** português do Brasil.

## Onde encontrar a informação correta

A documentação está dividida em **guias vivos** (comportamento e procedimentos vigentes) e **evidências históricas** (estado na data em que a auditoria, candidata ou release foi produzida). Não interpretar um relatório de novembro de 2026 sobre a `v2.2.0` como declaração sobre a `prod` atual.

### Guias vivos

- [Plano e estado da candidata v4.0.0 em dev](V4_0_0_DEV.md): ferramentas opcionais, limites atuais e critérios de liberação.

| Arquivo | Assunto | Atualizar quando... |
| --- | --- | --- |
| [README](../README.md) | Visão geral, rotas, instalação, limitações e links | Mudar funcionalidade visível, dependência principal ou documentação |
| [Estado atual](ESTADO_ATUAL.md) | Evidências da versão e recursos presentes na `prod` | Mudanças de release, produto, teste físico ou infraestrutura |
| [Arquitetura](ARQUITETURA.md) | Módulos, integração, contrato de dados e Workers | Mudar fluxo técnico, roteamento ou dependência |
| [Conversor PDF](CONVERSOR_PDF_EPUB.md) | Manual de conversão, OCR, metadados, reflowable/fixed | Mudar heurística, limites, formatos ou UI do conversor |
| [Desenvolvimento](GUIA_DESENVOLVIMENTO.md) | Comandos, mapa de componentes, revisão de PR | Mudar estrutura, scripts ou processo |
| [Qualidade e testes](QUALIDADE_TESTES.md) | Validação, coverage, browser, EPUBCheck e matriz manual | Mudar suite, thresholds ou resultado real |
| [Deploy e operação](DEPLOY_OPERACAO.md) | Netlify, cache, CSP, branches, release e rollback | Mudar headers, build, CI ou workflow de releases |
| [Segurança e limites](SEGURANCA_E_LIMITES.md) | Modelo de ameaças e riscos residuais | Mudar política de segurança/privacidade |
| [Processamento e Workers](WORKER_PROCESSING.md) | Fila, memória, cancelamento, progresso | Mudar Workers, orçamento e execução |
| [Compatibilidade EPUB](MATRIZ_COMPATIBILIDADE.md) | Perfis, NAV/NCX, fixed-layout e leitores | Mudar suporte real ou testes de conformidade |
| [Browsers](BROWSER_MATRIX.md) | Playwright, execução e limites de emulação | Mudar browser matrix |
| [Calibre](CALIBRE_READER_MATRIX.md) | Importação/renderização em Calibre e Kindle Previewer | Atualizar evidência real ou versões |
| [Homologação física](HOMOLOGACAO_MOBILE_REAL.md) | Procedimento e critérios Android/iOS reais | Obter evidência física |
| [Android AVD](ANDROID_CHROME_AVD.md) | Emulador Android/Chrome | Mudar automação ou comprovação |
| [Safari iOS Simulator](IOS_SAFARI_SIMULATOR.md) | Emulação do Safari no Xcode | Mudar automação ou comprovação |
| [CI econômica](CI_ECONOMICO.md) | Gatilhos reais e custo de workflows | Mudar YAML de Actions |
| [Cobertura](COVERAGE_GATE.md) | Gate de módulos críticos | Mudar arquivos/thresholds |
| [Supply chain](SUPPLY_CHAIN_AUDIT.md) | SBOM, licenças e OSV | Mudar verificação de dependências |
| [Dependências](AUDITORIA_DEPENDENCIAS.md) | Auditoria periódica | Mudar cron ou auditorias |
| [CSP Netlify](CSP_NETLIFY.md) | Políticas e testes da hospedagem | Mudar headers, Workers ou CSP |
| [Performance](PERFORMANCE_BUDGET.md) | Orçamentos e medições condicionais | Mudar budgets ou infraestrutura de testes |
| [Política Git](BRANCH_POLICY.md) | Branches, ruleset e promoção | Mudar regras ou governança |
| [Política de tags](BRANCH_TAG_POLICY.md) | Regras e release | Mudar `release.yml` ou rulesets |

### Arquivos históricos preservados

| Arquivo | Escopo histórico |
| --- | --- |
| [Inventário original](AUDITORIA_99_BASE.md) | Hipóteses e estado do código em 05/11/2026 (v2.2.0) |
| [Progresso dos 99 itens](AUDITORIA_99_PROGRESSO.md) | Histórico até 06/11/2026; 97/99 no último registro original |
| [Auditorias complementares](AUDITORIA_POST99.md) | Execuções de 2026 e decisões de E-100 a E-157 |
| [Decisões da auditoria](DECISOES_AUDITORIA.md) | Justificativas e evidências por execução |
| [Homologação v2.3.0](RELEASE_2_3_0_HOMOLOGACAO.md) | Critérios e checagens na época da publicação |
| [Candidata v2.4.0](RELEASE_2_4_0_CANDIDATA.md) | Plano original da candidata, posteriormente promovida |
| [Histórico de mudanças](../CHANGELOG.md) | Releases e mudanças posteriores à tag |
| [Notas de release](../.github/release-notes/) | Conteúdo versionado e datado das releases |
| [Fixtures internas](../tests/fixtures/README.md) | Origem e composição de materiais de teste |
| [Fixtures W3C](../tests/fixtures/w3c/README.md) | Corpus padronizado de terceiros |

Esses arquivos podem receber um **aviso de contextualização**, mas não devem ter evidências, datas ou resultados antigos reescritos para parecerem execução recente.

## Regras para documentação de novas mudanças

1. Descrever somente comportamento **realmente presente no código**, observado em teste ou confirmado no serviço.
2. Diferenciar **planejado**, **implementado**, **validado na CI**, **publicado** e **homologado em hardware físico**.
3. Registrar data, branch, SHA, PR, workflow ou origem quando o detalhe depender do tempo.
4. Manter links relativos entre arquivos existentes; não criar links para relatórios ou commits fictícios.
5. Não declarar 100% de fidelidade PDF/EPUB, segurança, testes físicos ou acessibilidade universal com base em indicadores internos.
6. Usar amostras sintéticas e preservar privacidade de obras reais.
7. Agrupar documentação com a mudança de código correspondente; em updates apenas documentais, não modificar runtime nem versionamento sem motivo.
8. Atualizar este índice quando um documento for adicionado, movido, arquivado ou substituído.

## Checklist de revisão documental

- [ ] README e estado atual descrevem as duas rotas.
- [ ] Versão do pacote e tag de release são diferenciadas de PRs pós-release.
- [ ] Arquitetura, dependências, Workers, OCR e limites correspondem ao código.
- [ ] Instruções `npm`, URLs, caminhos e links de docs existem.
- [ ] CI e branch policy correspondem ao YAML e ruleset consultados.
- [ ] Datas e números de auditoria antigos estão explicitamente marcados como históricos.
- [ ] Pendências físicas e limitações do OCR/performance são mantidas.
- [ ] Notas de release anteriores não foram reescritas como se fossem novas evidências.

[Voltar ao README](../README.md) · [Estado atual](ESTADO_ATUAL.md).
