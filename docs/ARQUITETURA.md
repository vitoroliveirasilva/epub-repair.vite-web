# Arquitetura e contratos internos

**Referência:** código em 12/11/2026. Esta é uma descrição do comportamento implementado, não um plano futuro.

## Visão de alto nível

```text
                    Navegador (mesma origem)
                    ┌──────────────────────────────┐
index.html + Vite → │ src/main.ts                  │
                    ├──────────────┬───────────────┤
                    │ /            │ /converter    │
                    │ EPUB Repair  │ PDF → EPUB    │
                    ├──────────────┼───────────────┤
                    │ reader/      │ PDF.js        │
                    │ validation/  │ Tesseract.js  │
                    │ repair/      │ reconstrução  │
                    │ cover/       │ buildEpub.ts  │
                    └──────┬───────┴───────┬───────┘
                           └─ motor EPUB ──┘
                       (validação e reparo final)
```

Não há serviço de aplicação remoto, base de dados ou armazenamento central para EPUBs/PDFs. `vite.config.ts` empacota os recursos OCR necessários; `netlify.toml` entrega o site estático com fallback para `index.html`, cabeçalhos de segurança e cache dos assets versionados.

## Módulos principais

| Diretório / arquivo | Responsabilidade |
| --- | --- |
| `src/main.ts` | Seleciona a rota e importa sob demanda a interface adequada. |
| `src/app/createApp.ts` | UI do validador/reparador EPUB, relatórios, troca de tema, footer e navegação. |
| `src/app/actions.ts` | Orquestra leitura, validação, reparo, troca de capa e resultados. |
| `src/app/state.ts`, `taskQueue.ts` | Estado volátil da página, execução serial e fila de tarefas compatíveis. |
| `src/app/zipLoadWorker.ts`, `zipWorkerClient.ts` | Leitura ZIP fora da thread principal, com cancelamento e fallback. |
| `src/epub/reader/` | Carregamento de EPUB, parsing/inspeção de estrutura ZIP, codificação de nomes. |
| `src/epub/validation/` | Verificações estruturais, referências, acessibilidade, segurança e compatibilidade. |
| `src/epub/repair/` | Correções seguras, integridade, preservação editorial, reempacotamento e Worker de ZIP. |
| `src/epub/sanitize/` | Política conservadora para HTML/XHTML, CSS e conteúdo ativo. |
| `src/epub/cover/` | Leitura, substituição e sincronização de referências de capa. |
| `src/epub/model/`, `utils/` | Tipos, códigos de issues, textos de relatório e funções reutilizáveis. |
| `src/converter/model.ts` | Tipos de PDF, opções, estados e resultados da conversão. |
| `src/converter/pdfEngine.ts` | PDF.js, extração de linhas, análise de páginas, OCR e metadados. |
| `src/converter/imageExtraction.ts` | Regiões de figuras embutidas encontradas nas operações gráficas do PDF. |
| `src/converter/textReconstruction.ts` | Blocos, colunas, margens, páginas, capítulos e XHTML reflowable. |
| `src/converter/buildEpub.ts` | Montagem ZIP/OPF/NAV/XHTML/CSS, validação EPUB e acabamento. |
| `src/converter/createConverterApp.ts` | UI de progresso, revisão, comparação, opções, geração e download PDF → EPUB. |
| `src/ui/`, `src/styles/` | Componentes e estilos de ambas as rotas; menu móvel compartilhado. |

## Contrato de entrada e saída do reparador EPUB

**Entrada:** bytes de `.epub` selecionado pelo usuário, com tamanho/estrutura limitados pelo leitor ZIP. **Processamento:** classificação de issues, ações apenas quando pertinentes e permitidas, revalidação da cópia. **Saída:** relatório e, somente quando houver alteração válida, um `Blob` EPUB para download.

A validação classifica issues por `fatal`, `error`, `warning` e `info`. `repairable` e a classificação de otimização opcional não equivalem automaticamente a gravidade. Alguns pontos devem ser conferidos manualmente. O score é uma apresentação heurística, não certificação.

A cópia reparada não deve perder palavras nem introduzir novas referências quebradas. Testes exercitam idempotência, preservação do manifest, spine, NAV/NCX, referências internas/externas, XHTML, CSS, imagens e metadados.

## Contrato de entrada e saída do conversor PDF

**Entrada:** `File` PDF local de até 250 MB, assinatura `%PDF`; opção de OCR/idioma e perfil. **Processamento:**

1. `pdfEngine.ts` lê PDF, texto nativo, operadores de imagem e metadados; classifica páginas como `cover`, `text`, `scanned`, `visual` ou `blank`.
2. Se habilitado e necessário, Tesseract.js reconhece texto nas páginas selecionadas para OCR. Recursos `por`/`eng` são servidos de `/ocr` pela mesma origem. A inicialização/execução tem timeout e permite cancelamento.
3. `textReconstruction.ts` interpreta linhas, colunas, hifenização, cabeçalhos repetidos, seções e sumário; registra avisos quando precisa de revisão.
4. A interface permite conferir/editar `EditableSection` e informações da obra. Edições de título, autor, metadados e corpo invalidam o resultado anterior.
5. `buildEpub.ts` escolhe `reflowable` ou `fixed`, monta o EPUB com `mimetype` não comprimido, container, OPF, NAV, CSS, XHTML e mídias.
6. A saída passa por `inspectEpub`, reparo de acabamento quando aplicável e nova verificação. Erros fatais ou erros estruturais residuais impedem disponibilização.

**Saída:** `ConversionResult` com `fileName`, `blob`, `bytes`, `layout`, `validation` e avisos da análise. O score de confiança não prova correspondência palavra por palavra com o PDF.

## Concorrência, cancelamento e progresso

- O validador usa leitura ZIP via Worker da mesma origem e Worker independente de compactação, com fallback quando necessário. A fila é local e efêmera; operações são serializadas.
- O conversor usa `AbortController`, destruição da tarefa PDF.js, limpeza de canvas e encerramento do Worker OCR. Fases de renderização mantêm animação visual contínua, mesmo com mensagens atualizadas por página.
- Porcentagens representam **etapas específicas**; não presumir uma fração contínua e matematicamente exata do tempo restante.
- Alguns trabalhos de DOM/XML, PDF.js e canvas rodam na thread principal; não se deve prometer responsividade irrestrita em dispositivos com pouca memória.
- A interface nunca deve liberar um download parcial após cancelamento ou falha de validação.

## Segurança, acessibilidade e preservação

- Limites e verificações de ZIP/OCF, restrições de caminhos e saneamento de recursos ativos devem ser mantidos em alterações futuras.
- Não remover fontes HTTP/HTTPS legítimas apenas porque são externas; preservar por padrão e exigir opção/consentimento em operações sensíveis.
- Não inventar idioma, ordem editorial ou significado de texto/imagem quando a entrada é ambígua.
- `src/ui/mobileNavigation.ts` usa `dialog.showModal()`, fechamento explícito, tecla Escape e bloqueio de rolagem; `src/styles/mobileNavigation.css` respeita `prefers-reduced-motion`.
- A interface móvel é compartilhada, mas o conteúdo editorial gerado pode variar entre leitores; acessibilidade de imagens deve ser revisada conforme o conteúdo, não preenchida automaticamente com rótulos fictícios.

## Dependências e build

- **Vite/TypeScript:** frontend e bundle ESM para browsers modernos.
- **JSZip:** criação/reempacotamento EPUB.
- **PDF.js (`pdfjs-dist`):** interpretação e renderização das páginas do PDF.
- **Tesseract.js + `@tesseract.js-data/por`/`eng`:** OCR local com assets emitidos pelo build em `/ocr`.
- **Vitest/jsdom:** regressão; **Playwright** é instalado isoladamente na CI de browser, não é dependência de runtime do site.

Não adicionar um endpoint de upload, telemetria de conteúdo ou serviços de OCR remoto sem atualizar arquitetura, privacidade, CSP e testes.

## Referências

[Conversor PDF → EPUB](CONVERSOR_PDF_EPUB.md) · [Worker e cancelamento](WORKER_PROCESSING.md) · [Modelo de ameaças](SEGURANCA_E_LIMITES.md) · [Qualidade](QUALIDADE_TESTES.md) · [Deploy](DEPLOY_OPERACAO.md).
