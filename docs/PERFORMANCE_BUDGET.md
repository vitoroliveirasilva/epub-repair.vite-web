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
benchmark de capacidade máxima do navegador. Testes maiores, limites por
dispositivo e um worker/cancelamento permanecem pendentes.
