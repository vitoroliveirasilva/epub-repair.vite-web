# Processamento assíncrono e limites do Worker

> **Estado em 12/11/2026:** o comportamento descrito está publicado em `prod`, não somente em `dev`. Os Workers de leitura/compactação ZIP usam `worker-src 'self'` na configuração atual. O conversor PDF usa seu próprio fluxo PDF.js/OCR; ver [Arquitetura](ARQUITETURA.md) e [Conversor](CONVERSOR_PDF_EPUB.md). As medições históricas abaixo continuam válidas apenas para seus ambientes de teste.

## Fluxo do reparador EPUB (disponível em produção)

1. O navegador mantém o arquivo original e as opções de reparo em estado local.
2. A extração ZIP roda em um **Web Worker de mesma origem** quando o navegador
   oferece a API; a CSP permite `worker-src 'self'`.
3. Cada entrada extraída emite progresso real `concluídas/total`.
   Os buffers extraídos são transferidos do Worker para a página principal
   sem clonar novamente todos os recursos extraídos.
4. A validação de XML/XHTML, documentos de navegação e a renderização do
   relatório ainda são executadas na página, pois `DOMParser` e APIs de
   imagem/canvas não estão disponíveis no Worker atual.
5. Quando o usuário solicita reparo, o ZIP já carregado pelo Worker pode
   ser reutilizado pelo reparador, evitando uma descompactação adicional.
6. A geração do ZIP informa percentual real emitido pelo JSZip.
   A validação final reprova novos erros/avisos antes de disponibilizar a saída.

## Cancelamento e fila

A interface aceita **um job ativo por vez**, impedindo sobreposição de arquivos
ou opções diferentes. O usuário pode usar **Cancelar operação** enquanto houver
trabalho. O `AbortController` termina o Worker da extração imediatamente,
descarta resultados recebidos após cancelamento e impede publicar o resultado
em checkpoints após operações assíncronas de reparo e capa.
No fallback sem Worker, o leitor ZIP agora recebe o mesmo sinal e interrompe
a stream entre blocos ou entradas (inclusive se o cancelamento ocorrer no
callback de progresso), sem interpretar cancelamento como EPUB inválido.

**Atualização execução 16:** existe agora fila **FIFO temporária por página**
para até 8 operações pendentes do **mesmo EPUB**, sem concorrência:
`src/app/taskQueue.ts`. O usuário pode enfileirar verificações ou reparo
enquanto outra ação compatível está ativa. Cancelar operação também limpa
a fila. Tarefas que apagariam um EPUB recém-corrigido são bloqueadas.

A extração **e a recompactação** são feitas por Workers independentes.
`src/epub/repair/zipBuildWorkerClient.ts` encerra o Worker no abort e
descarta respostas tardias. JSZip continua dentro do Worker, onde o
cancelamento pode ser preemptivo. Sem Worker, a compactação tem checkpoints,
mas não pode ser interrompida no meio da chamada síncrona subjacente.
A UI diferencia progresso real de entradas ZIP de **porcentagem de
recompactação**, sem alegar percentual do fluxo completo.

**Limitações concretas:** a fila não sobrevive a reload, não processa
múltiplos livros em lote e a validação DOMParser síncrona (XML/XHTML/canvas)
permanece no thread principal. Não prometer Worker universal ou ausência
de travamento em todo dispositivo.

## Memória e compatibilidade

O arquivo fonte permanece no navegador; o envio de bytes ao Worker cria uma
cópia transitória da entrada e o resultado transfere os buffers extraídos.
Logo, embora a UI não precise ficar bloqueada durante a extração, **isso não
comprova menor pico de RAM** em EPUBs grandes. Há fallback para o leitor normal
se Worker estiver indisponível. Sem medições em Safari/iOS, Android e dispositivos
com pouca memória, E-032 e E-080 permanecem **parciais**.

## Regressões automatizadas

- `tests/zipWorkerCancellation99.test.ts`: progresso, terminação, falha,
  resultado tardio e fallback sem Worker, incluindo interrupção durante
  descompactação com `AbortError` real e testes de cancelamento prévio.
- `tests/processingUiCancel99.test.ts`: botão, status e preservação de estado.
- `tests/zipRebuildProgress99.test.ts`: progresso de JSZip, ZIP íntegro e
  cancelamento sem publicação.
- `tests/singleLoadRepair99.test.ts`: relatórios idênticos ao reutilizar
  dados extraídos.

A conformidade real do Worker em navegadores físicos, especialmente WebKit,
não foi homologada.

## Execução 16: evidência adicional de Workers

- `tests/zipBuildWorker99.test.ts`: clone estruturado sem desprender bytes
  originais, progresso real, aborto prévio e intermediário, resposta tardia
  descartada, erro de Worker sem publicar Blob e fallback com ZIP válido.
- `tests/taskQueue99.test.ts`: ordem FIFO, máximo de 8 pendentes, cancelamento
  da fila preservando a ação ativa, continuação após erro individual.
- `tests/processingUiCancel99.test.ts`: botões de enfileirar, bloquear nova
  verificação destrutiva do resultado, porcentagem real e estado de cancelamento.
- `tests/browser-large-workflow.mjs`: upload EPUB 12 MiB em viewport móvel,
  análise/reparo e download, 3 Workers reais observados no Chromium e Firefox,
  preservação integral do recurso binário.
- `tests/browser-resource-budget.mjs`: comportamento real até 250 MiB
  no Chromium com heartbeat e RSS de processos.

A `prod` usa `worker-src 'self'` em `netlify.toml` desde as promoções posteriores às auditorias de 06/11. Sempre conferir o header HTTPS publicado ao alterar a CSP ou os Workers. A descrição anterior de `worker-src 'none'` referia-se à produção histórica v2.2.0, não à versão atual.

**E-032/E-080 fechados no escopo de execução automatizada da aplicação;
mobile físico, Netlify publicado e leitores Kindle permanecem como
critérios de outros itens ainda parciais.**
