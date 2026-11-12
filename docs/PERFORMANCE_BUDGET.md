# Teste limitado de desempenho e memória

> **Interpretação em 12/11/2026:** os valores e runs abaixo são evidências de laboratório para **EPUB**, principalmente Chromium/Linux, no momento da medição. O conversor PDF introduz leitura de páginas, renderização e OCR por Tesseract.js, que podem ter perfis de CPU/memória distintos. **Não extrapolar budgets de ZIP de 250 MiB para conversão PDF nem para celulares reais**; ver [Conversor](CONVERSOR_PDF_EPUB.md), [Qualidade](QUALIDADE_TESTES.md) e [Homologação física](HOMOLOGACAO_MOBILE_REAL.md).


A regressão `tests/performanceBudget99.test.ts` constrói um EPUB 3 sintético
com um recurso binário determinístico de 2 MiB e executa leitura e reparo
completos no Node.js 20 e 22 (CI).

Critérios automatizados por execução:
- duração total estritamente inferior a 30 segundos
- crescimento de RSS amostrado estritamente inferior a 320 MiB
- integridade de conteúdo, ZIP válido e ausência de erros fatais no resultado

O orçamento é propositalmente folgado para reduzir flutuações de CI e serve
para detectar degradações grosseiras. Os números são impressos no log de teste.

**Limitações:** amostragem a cada 25ms não mede picos síncronos menores,
RSS reflete outros objetos do processo, e o teste de 2 MiB não demonstra
compatibilidade com 250 MiB, dispositivos móveis ou leitoras. Não é um
benchmark de capacidade máxima do navegador. O cancelamento de ZIP no Worker e fallback está implementado. Medições
maiores, totais por processo/dispositivo e leitoras permanecem pendentes.

## E-031/E-096: benchmark de navegador Chromium adicionado à CI

`tests/browser-resource-budget.mjs` usa Playwright Chromium em Linux,
amostras determinísticas de **1 MiB e 12 MiB descompactados**, extração
no Web Worker real, reparo conservador e revalidação completa. Os budgets
de tempo são de **45 e 115 segundos**, e os limites de crescimento de
**heap JS da thread principal** são de **320 e 440 MiB**, respectivamente.
O cronômetro exclui a construção da fixture no Node.js e a medição usa
`Performance.getMetrics` via CDP a cada 250ms. Um contador de heartbeat
no event loop detecta paralelismo observável.

Esses valores são **limites de regressão (grosseiros), não garantias**:
CDP `JSHeapUsedSize` da aba principal **não inclui o heap do Worker**,
memória nativa de imagens/ZIP, RSS total nem outro navegador. Medições de
1/12 MiB não cobrem o limite de entrada de **250 MiB** do produto.
A matriz também testa Node.js com 2 MiB e RSS amostrado.
O novo gate é executado somente no job Chromium da matriz.

### Resultado observado em Chromium headless na CI

[Run 42149808645](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42149808645),
Ubuntu Linux headless, Playwright e Chrome DevTools Protocol:

| Conteúdo descompactado | Tempo leitura/reparo/revalidação | Crescimento máximo amostrado do JS heap da aba | Heartbeats |
| --- | ---: | ---: | ---: |
| 1 MiB | 4,694 s | +16,2 MiB | 4 |
| 12 MiB | 59,285 s | +261,8 MiB | 25 |

**NOTA DE CORREÇÃO (execução 14):** esses números históricos incluem a
serialização de `Array.from(source)` entre Node.js e o navegador pelo
Playwright. **Não representam somente o custo do EPUB Repair.** Foi trocada
a transferência para `setInputFiles`, iniciando o cronômetro depois que
a fixture está disponível no browser. Os resultados abaixo substituem a
avaliação anterior de velocidade. Os números anteriores são mantidos para
transparência, não para comparação com o processamento real.

**Resultados anteriores aprovados nos budgets de CI, mas de desempenho ruim para aparelhos
modestos.** A geração da fixture não integra o cronômetro, a entrada é enviada
à aba como Array JS e o JSZip faz compressão completa, o que pode elevar custo.
NÃO extrapolar proporcionalmente para 250 MiB ou declarar consumo total,
pois a métrica não cobre o processo Worker nem memória nativa do navegador.
E-031 e E-096 continuam parciais até testes e otimizações mais abrangentes.

## Execução 14: medição corrigida de 1, 12 e 48 MiB (Chromium Linux CI)

O benchmark agora utiliza `page.locator(...).setInputFiles` para transferir
o EPUB ao navegador, sem converter o arquivo em milhões de números em JSON.
O cronômetro é iniciado **depois** da transferência nativa. O resultado
mede extração via Worker, reparo conservador e revalidação.

| Tamanho recurso extraído | Tempo observado | Pico amostrado JS heap thread principal | Heartbeats |
| --- | ---: | ---: | ---: |
| 1 MiB | **211 ms** | +0,1 MiB | 4 |
| 12 MiB | **1.239 ms** | +3,0 MiB | 24 |
| 48 MiB | **4.920 ms** | +0,0 MiB | 95 |

[CI de browsers 42152110422 aprovada](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42152110422).

O valor de +0,0 MiB é efeito possível de amostragem/GC e não indica
uso zero de RAM. O CDP `JSHeapUsedSize` não inclui o heap do Worker ou
memória nativa; por isso E-031 e E-096 permanecem **parciais** até
amostragem total e stress até o limite de 250 MiB.

## Fechamento do orçamento automatizado no limite de 250 MiB (E-096)

`tests/browser-resource-budget.mjs` agora percorre 1, 12, 48 e **250 MiB
de conteúdo descompactado** e mede extração via Worker, reparo,
reempacotamento e revalidação em Chromium headless. O arquivo de fronteira
foi dividido em **três entradas de 90/90/70 MiB**, respeitando limites
internos por recurso. O Playwright recebe EPUBs via caminho temporário em
disco para evitar o limite de 50MiB do `setInputFiles({buffer})`. O arquivo
permanece no disco até o navegador concluir a leitura e é limpo ao final.

Resultados de [run 42153236152](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42153236152):

| Corpus descompactado | Tempo | Crescimento JS heap thread principal | Ciclos do heartbeat |
| --- | ---: | ---: | ---: |
| 1 MiB | 220 ms | +1,7 MiB | 4 |
| 12 MiB | 1.280 ms | +1,9 MiB | 25 |
| 48 MiB | 4.857 ms | +0,5 MiB | 96 |
| 250 MiB | 19.807 ms | +2,9 MiB | 388 |

**Budget máximo por caso:** 45/115/180/300 segundos e +320/+440/+760/
+1600 MiB no JSHeapUsedSize da aba (nesta ordem). São gates de regressão,
não garantias de performance em dispositivos de usuário. Não foram
amostrados RSS total, heap de Worker nem memória nativa. Um resultado
`+0 MiB` não corresponde a RAM zero, apenas a amostragem da métrica.

**E-096 no escopo de cobertura automatizada:** concluído. **E-031:** continua
parcial devido ao pico total de RAM, repetição de ciclos e dispositivos
modestos. O teste do corpus de fronteira não representa todas as classes
de EPUB nem integrações com leitores físicos.

## Execução 16: memória real de processos e Worker

O teste passou a medir **RSS agregado dos processos Chromium** com `ps`
durante cada caso, complementando o CDP `JSHeapUsedSize` da aba.
[Primeira CI RSS aprovada (42153674625)](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42153674625)
registrou **+640 MiB** de RSS agregado no EPUB sintético com **250 MiB
descompactados**, com cerca de **14,2 segundos** para o pipeline.
O novo Worker de compactação passou em [CI 42213708002](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42213708002)
com até **+713,7 MiB** de RSS agregado na fixture de 250 MiB em
aproximadamente **20,3 segundos**. O maior tempo é medição, não regressão
comprovada em todos os computadores.

O RSS agregado pode **contar páginas de memória compartilhadas duas vezes**,
mas inclui alocações de processos/Workers ausentes de métricas exclusivas
do heap JS da aba. A coleta de 250ms pode perder picos subamostrados.
Os orçamentos continuam sendo limites do laboratório Linux, não promessas
de RAM em iOS/Android. E-031 fechado no critério de teste de picos reais
com orçamento 1/12/48/250 MiB no Chromium.
