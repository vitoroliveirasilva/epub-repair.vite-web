# Qualidade, testes e interpretação das evidências

**Referência:** workflows versionados e suíte existente em 12/11/2026. A aprovação de um teste confirma apenas o cenário que ele mede.

## Pirâmide de verificação

| Camada | Ferramenta e arquivos | Escopo comprovável |
| --- | --- | --- |
| Tipos e lint | `npm run typecheck`, `npm run lint` | Contratos TypeScript e regras estáticas do código. |
| Build | `npm run build` | Bundle Vite e empacotamento de recursos, inclusive OCR local. |
| Unidade/integração | `npm test`, Vitest com projetos Node/jsdom | Leitura, reparo, segurança, reconstrução PDF e comportamento DOM coberto por testes. |
| Formato EPUB | `EPUBCheck 5.4.0` em `.github/workflows/ci.yml` | Fixtures sintéticas inválidas antes do reparo e aceitas após correção; não qualquer livro externo. |
| Browser E2E | `tests/browser-smoke.mjs`, `browser-converter.mjs`, `browser-large-workflow.mjs`, `browser-csp.mjs` | Fluxos em Chromium, Firefox, WebKit, desktop e viewport móvel, conforme cenário. |
| Segurança dependências | `npm audit`, supply chain, SPDX/CycloneDX, licenças, OSV | Vulnerabilidades conhecidas e políticas do grafo de dependências examinado. |
| Cobertura crítica | `vitest.config.ts` + `.github/workflows/coverage.yml` | Percentuais dos cinco módulos monitorados, não cobertura completa de todo o produto. |
| Leitores/formatos | Calibre, Kindle Previewer e testes manuais | Compatibilidade restrita às fixtures, sistemas e versões efetivamente executados. |
| Aparelhos físicos | Procedimento `HOMOLOGACAO_MOBILE_REAL.md` | **Pendente de evidências completas** para E-082/E-089. |

## Comandos locais

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

A suíte base não depende de dados de livros pessoais. Testes com corpus W3C estão em `tests/fixtures/w3c/`, com notas de procedência próprias. A interface de PDF usa testes `pdfConverterAnalysis`, `pdfConverterMetadata`, `pdfConverterReconstruction`, `pdfEmbeddedImages` e `pdfConverterEpub`.

## GitHub Actions e gatilhos reais

- **`ci.yml`:** push em `dev` executa quality gate Node **22**; push em `prod` e PR não draft para `prod` usam Node **20/22**. O job EPUBCheck roda em `prod`, PR pronta para `prod`, workflow manual ou por gatilho explícito previsto no YAML.
- **`browser-matrix.yml`:** `prod` e PR pronta para `prod` com caminhos relevantes; push em `dev` precisa do marcador `[browser]` para executar a matriz. Executa Chromium, Firefox e WebKit.
- **`coverage.yml`:** `prod`, PR pronta para `prod` quando caminhos relevantes mudam, e execução manual. **Não** é um gate automático de todo push em `dev`.
- **`calibre-reader.yml`:** verifique os filtros do YAML; não presumir que toda alteração apenas documental acione o leitor.
- **`netlify-live-preview.yml`:** teste de cabeçalhos/CSP hospedados sob seus gatilhos próprios, não equivalente a `vite preview` local.
- **`android-emulator.yml`, `ios-simulator.yml`, `kindle-preview.yml`:** suites complementares, com acionamento específico; simulação não é validação em hardware de usuário.
- **`release.yml`:** observa `CI` concluída após push em `prod`, valida SemVer e versões do lockfile e evita republicar uma tag já existente. Não cria tag nova para commits que continuam com a mesma versão.

Para custo de CI, mudanças relacionadas devem ser agrupadas. O histórico de execuções pode conter jobs cancelados por concorrência; um job cancelado não deve ser apresentado como aprovação. Ver [CI econômica](CI_ECONOMICO.md).

## Gates de cobertura

`vitest.config.ts` monitora com `perFile: true` os módulos:

1. `src/epub/utils/pathUtils.ts`
2. `src/epub/reader/rawZipInspector.ts`
3. `src/epub/validation/validateNavigation.ts`
4. `src/epub/sanitize/sanitizeActiveContent.ts`
5. `src/epub/repair/preservationAudit.ts`

Limiares: **88% linhas, 85% statements, 70% branches e 82% funções**. Os valores são contrato de regressão dos cinco arquivos e não percentual de cobertura do repositório inteiro. O workflow instala `@vitest/coverage-v8@4.1.12` em ambiente isolado conforme `coverage.yml`.

## Testes de tela e responsividade

- **`browser-smoke.mjs`:** validação e reparo EPUB, tema, relatório JSON, menu lateral móvel, links do footer e componentes responsivos.
- **`browser-converter.mjs`:** PDF sintético, metadados, revisão avançada, alertas de tamanho, barra de progresso, menu móvel, footer e download.
- **`browser-large-workflow.mjs`:** EPUB de dimensão maior com Workers e integridade de conteúdo.
- **`browser-csp.mjs`:** CSP aplicada ao bundle no laboratório; cabeçalhos reais do Netlify requerem teste na hospedagem.
- **`browser-resource-budget.mjs`:** limites específicos de tempo/memória do runner Chromium, não garantia para celulares comuns.

Larguras de tela em automação e testes DOM não substituem inspeção visual em aparelhos reais, modo paisagem, fonte ampliada ou leitores de tela. Ver [Matriz de browsers](BROWSER_MATRIX.md).

## Conformidade editorial e segurança

As fixtures de EPUB 2/3 são geradas pelo próprio projeto e verificadas no EPUBCheck. Uma saída sem `fatal`/`error` no motor interno significa apenas que os validadores implementados não detectaram tais problemas. Não anunciar “100% Kindle”, “certificado EPUBCheck” para arquivo arbitrário, “pixel-perfect” para PDF, “antivírus” ou “sem perdas” com base nesses indicadores.

Em textos reais, conferir pelo menos: título/autor/ISBN, ordem dos capítulos, sumário, conteúdo integral, notas, tabelas, imagens, hifenização, palavras unidas, links e compatibilidade no leitor pretendido.

## Matriz manual mínima sugerida

| Cenário | Onde testar | Critério |
| --- | --- | --- |
| EPUB 2 e EPUB 3 | Calibre + leitor pretendido | Texto e navegação preservados, recurso referenciado disponível. |
| EPUB reparado duas vezes | Browser + ZIP diff | Segunda execução não provoca alteração artificial. |
| PDF de texto selecionável | Browser + EPUB no leitor | Seções/ilustrações e conteúdo editorial revisados. |
| PDF de imagens/colunas | Browser + EPUB no leitor | OCR e ordem de leitura conferidos, avisos tratados ou documentados. |
| Mobile Android físico | Chrome/Firefox | Upload, cancelamento, relatórios, download não vazio, arquivo abrível. |
| Mobile iOS físico | Safari | Upload, `blob:`/download, salvar em Arquivos, abrir no Apple Books. |
| Navbar | 320–760 px, claro/escuro | Drawer acessível, sem scroll de fundo, links corretos. |
| Erros e avisos | 320–430 px, texto extenso | Cards íntegros, sem corte ou scroll horizontal indevido. |

## Como registrar uma evidência

Anote **data, SHA, workflow/run ou aparelho/versão, input sintético ou autorizado, operação, resultado e limitação**. Não reutilize a CI de um SHA antigo para aprovar commits novos. Um resultado de emulador não fecha o item de dispositivo físico.

Links: [Estado atual](ESTADO_ATUAL.md) · [Compatibilidade](MATRIZ_COMPATIBILIDADE.md) · [Performance](PERFORMANCE_BUDGET.md) · [Segurança](SEGURANCA_E_LIMITES.md) · [Homologação física](HOMOLOGACAO_MOBILE_REAL.md).
