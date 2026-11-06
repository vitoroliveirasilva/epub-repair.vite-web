# Teste limitado de desempenho e memória

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
