# Processamento assíncrono e limites do Worker

## Fluxo disponível na branch `dev`

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

**Limitações concretas:** não há uma fila persistente de trabalhos; a validação
DOM síncrona não pode ser interrompida durante a execução; o JSZip não é
terminado no meio de todas as etapas de recompactação, mas a saída é descartada
se houver cancelamento antes do resultado final. O usuário não deve interpretar
o progresso de ZIP como porcentagem de todo o trabalho.

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
