# Conversão PDF → EPUB: uso, implementação e limitações

**Estado:** funcionalidade publicada após a release `v2.5.0`, introduzida nas PRs [#43](https://github.com/vitoroliveirasilva/epub-repair.vite-web/pull/43) a [#47](https://github.com/vitoroliveirasilva/epub-repair.vite-web/pull/47) e refinada nas PRs #48–#54. A última release numerada pode ser anterior a esse código.

## O que o conversor faz

A rota `/converter` analisa um PDF local com PDF.js e gera um EPUB com duas estratégias de apresentação:

| Modo | Comportamento | Quando considerar |
| --- | --- | --- |
| **Automático** (`auto`) | Aceita a sugestão heurística do analisador para o documento. | Primeira conversão, seguida de conferência. |
| **Texto ajustável** (`reflowable`) | Recria seções XHTML, reorganiza texto em parágrafos, inclui imagens embutidas e oferece fonte/tamanho ajustáveis no leitor. | Livros com texto selecionável, parágrafos e capítulos. |
| **Layout visual fixo** (`fixed`) | Mantém a aparência da página como imagem/renderização por página no pacote EPUB. | PDFs cuja diagramação é essencial, formulários, páginas muito visuais. |

A conversão **não deve ser descrita como idêntica ao PDF**. O EPUB ajustável intencionalmente altera as quebras de página e a disposição visual. O EPUB de layout fixo preserva a aparência, mas não oferece a mesma flexibilidade de texto.

## Fluxo da interface

1. Selecionar um `.pdf` com tamanho **até 250 MB**, extensão/tipo compatível e assinatura `%PDF`.
2. Aguardar a análise por página. O card de progresso apresenta fase atual e percentual de etapa; a animação não reinicia a cada página.
3. Verificar o painel **Pontos para conferir**: imagens pequenas, colunas, OCR de baixa confiança e outras anomalias podem gerar avisos.
4. Conferir metadados sugeridos: título, autor, editora, data/ano, ISBN, tradutor e descrição.
5. Ajustar perfil, idioma e formato, reanalisando se houver mudança que afete a leitura.
6. Abrir **Comparar e editar o conteúdo**, se preciso. É possível navegar por página/seção, alterar títulos e texto, criar, mover, mesclar, dividir ou remover seções conforme os comandos disponíveis.
7. Gerar o EPUB e usar o botão de download quando o arquivo passar pelo motor interno de validação.

O painel avançado preserva o estado aberto/fechado enquanto se troca página ou capítulo. Um novo arquivo reinicia o estado. O carregamento, o botão Cancelar e o resultado permanecem distintos. O painel de avisos cresce com o conteúdo, sem altura máxima fixa.

## Opções expostas ao usuário

| Opção | Padrão | Observação |
| --- | --- | --- |
| Perfil | `book` | `book`, `academic`, `visual` orientam análise e sugestão. |
| Layout | `auto` | `auto`, `reflowable`, `fixed`. |
| Idioma principal | `pt-BR` | `pt-BR` e `en`; para OCR são usados dados `por` ou `eng`. |
| Leitura de páginas digitalizadas | Ativada | OCR local opcional, indicado para páginas sem texto nativo útil. |
| Remover cabeçalhos e rodapés repetidos | Ativada | Heurística por padrões recorrentes; conferir resultados em livros complexos. |
| Remover números de página | Ativada | Tenta remover somente números isolados nas margens. |
| Reconstruir palavras hifenizadas | Ativada | Pode exigir revisão de compostos e hifenização legítima. |
| Normalizar tipografia | Ativada | Espaços, pontuação e outros ajustes heurísticos. |

Os metadados podem ser inferidos do cabeçalho PDF e das páginas iniciais. Se o ISBN for aceito como válido, a geração usa um identificador `urn:isbn:`; caso contrário usa UUID. Não assumir que o ISBN foi necessariamente detectado ou que todo ISBN impresso é inequívoco.

## Pipeline técnico

```text
File PDF → validação preliminar
        → pdfjs-dist / PDF.js Worker
        → textos, fontes, retângulos, operador de imagem, metadados
        → OCR local (opcional, só páginas selecionadas)
        → reconstrução de linhas/colunas/figuras/seções
        → revisão editorial e edição no navegador
        → reflowable ou fixed-layout
        → JSZip (mimetype, container, OPF, NAV, XHTML/CSS, imagens)
        → inspectEpub → reparo de acabamento, se aplicável → inspectEpub
        → Blob EPUB para download
```

Referências: `src/converter/pdfEngine.ts`, `imageExtraction.ts`, `textReconstruction.ts`, `buildEpub.ts` e `createConverterApp.ts`.

### OCR

- Tesseract.js é inicializado apenas quando o analisador seleciona páginas e a opção está ativa.
- `vite.config.ts` entrega `worker.min.js`, wasm e dados de idioma em `/ocr` pela mesma origem; não se utiliza serviço de OCR de terceiros.
- Limite de **25 segundos para iniciar** o worker OCR e de **35 segundos por reconhecimento de página** no código observado. Em timeout/falha, a análise registra aviso e prossegue quando possível, em vez de manter a UI travada indefinidamente.
- O reconhecimento pode confundir títulos, símbolos, tabelas, ordem de linhas e pontuação. Sempre comparar com o PDF real.

### Figuras e ilustrações

`imageExtraction.ts` reconhece regiões associadas a operações de imagem e aplica limites de tamanho e sobreposição para evitar pequenas marcas insignificantes. `pdfEngine.ts` recorta a representação, e `buildEpub.ts` inclui as imagens referenciadas no texto ajustável. Páginas altamente visuais podem ser preservadas em imagens integrais.

**Limites:** nem todos os gráficos vetoriais, logotipos diminutos, formulários ou tabelas são recuperados na ordem/posição exata. Alguns diagramas são mais apropriados ao modo visual fixo. O aviso `PDF_GRAPHICS_NEED_REVIEW` existe para indicar a necessidade de conferência.

### Texto e hierarquia editorial

`textReconstruction.ts` agrupa linhas e parágrafos, reconhece possíveis títulos, marca conteúdo visual e evita inserir como capítulos alguns códigos bibliográficos (CDD/CDU/ISBN). A reconstrução da ordem de colunas e a detecção de margens recorrentes são heurísticas. Pequenos trechos em negrito, palavras unidas e quebras artificiais podem exigir revisão manual.

### Integridade da saída

O EPUB criado usa `mimetype` não comprimido, pacote OPF com identificador, recursos, spine, NAV e XHTML/CSS. Depois de gerar, o motor interno inspeciona a estrutura, executa reparo conservador quando necessário e **não libera** arquivo com erros fatais ou erros estruturais residuais.

**Isso não equivale a executar o EPUBCheck oficial no navegador**. O EPUBCheck 5.4.0 é verificador externo executado no GitHub Actions sobre fixtures. Não confundir os indicadores de qualidade do site com certificação EPUBCheck.

## Problemas frequentes

| Sintoma | Possível causa / conduta |
| --- | --- |
| O PDF pede senha | Arquivo protegido; a ferramenta não remove proteção. Use uma cópia legalmente desprotegida. |
| Uma página demora na leitura | Página digitalizada/OCR; confira se a análise conclui e considere desativar OCR se a reconstrução textual não for necessária. |
| Páginas de formulário desorganizadas | O modo ajustável reconstrói texto, não reproduz diagramação. Tente o layout visual fixo. |
| Ícone ou imagem não aparece | Pode estar abaixo do limiar de detecção ou não ser raster independente. Confira a página original e os avisos. |
| Texto de duas colunas misturado | Heurística de ordenação falhou; revisar seções ou utilizar layout visual. |
| Capítulo incorreto | Corrigir títulos e seções em **Comparar e editar o conteúdo**. |
| ISBN não identificado | Completar manualmente, respeitando o valor impresso. |
| EPUB não liberado | O acabamento detectou falha estrutural; não forçar download sem investigar a causa. |

## Testes e critérios de regressão

- `tests/pdfConverterAnalysis.test.ts`, `pdfConverterMetadata.test.ts`: leitura e metadados.
- `tests/pdfConverterReconstruction.test.ts`: linhas, parágrafos, capítulos e classificação.
- `tests/pdfEmbeddedImages.test.ts`: figuras, manifest, páginas e ISBN.
- `tests/pdfConverterEpub.test.ts`: pacote EPUB e formatos.
- `tests/browser-converter.mjs`: fluxo real de conversão e UI em navegadores, inclusive revisão avançada, avisos extensos e menu móvel.

Testar com **PDFs cujos direitos de uso estejam assegurados**; não colocar livros privados/comerciais completos em fixtures públicas. Ver [Matriz de compatibilidade](MATRIZ_COMPATIBILIDADE.md), [Arquitetura](ARQUITETURA.md), [Qualidade](QUALIDADE_TESTES.md) e [Segurança](SEGURANCA_E_LIMITES.md).
