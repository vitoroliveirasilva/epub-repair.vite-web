# Guia de desenvolvimento e manutenção

**Última revisão documental:** 12/11/2026. A documentação de arquitetura e produto em [ESTADO_ATUAL.md](ESTADO_ATUAL.md) deve ser consultada junto ao HEAD que será editado.

## Ambiente e execução

- **Node.js:** 20 ou superior; a CI de qualidade utiliza 20 e 22 nas PRs para produção.
- **npm:** instalar pelo lockfile para preservar a árvore de dependências.
- **Vite:** `npm run dev` inicia em `http://localhost:5173/`; `npm run preview` em `http://localhost:4173/`.
- **Rotas:** `/` (EPUB) e `/converter` (PDF).
- **Dependências:** JSZip, PDF.js, Tesseract.js e dados OCR português/inglês.
- **Compilação:** `npm run build` roda TypeScript e Vite, emitindo `dist/`. O bundle inclui `/ocr/` pelo plugin de `vite.config.ts`.

```bash
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

Rode os comandos separadamente ou em sequência conforme a alteração. Não presuma que a execução local testa headers HTTPS da Netlify.

## Como localizar uma alteração

| Objetivo | Começar por |
| --- | --- |
| Validação, gravidade e códigos de problemas | `src/epub/validation/`, `src/epub/model/issueTypes.ts` |
| Reparo e preservação editorial | `src/epub/repair/`, `tests/preservationEditorial99.test.ts` |
| ZIP e cancelamento | `src/epub/reader/`, `src/app/zipWorkerClient.ts`, `src/epub/repair/zipBuildWorkerClient.ts` |
| Capa | `src/epub/cover/`, `src/ui/components/CoverChanger.ts` |
| PDF, OCR e imagens | `src/converter/pdfEngine.ts`, `imageExtraction.ts`, `vite.config.ts` |
| Divisão de capítulos e XHTML | `src/converter/textReconstruction.ts` |
| Geração e validação da cópia PDF → EPUB | `src/converter/buildEpub.ts` |
| Interface do conversor | `src/converter/createConverterApp.ts`, `src/styles/converter.css` |
| Cartões de erros/conferência manual | `src/ui/components/IssueList.ts`, `RepairSummary.ts`, `src/styles/reportLayoutFixes.css` |
| Menu móvel | `src/ui/mobileNavigation.ts`, `src/styles/mobileNavigation.css` |
| Footer | `src/app/createApp.ts`, `src/converter/createConverterApp.ts`, `src/styles/layout-polish.css` |

## Regras de alteração

1. **Reduza o escopo:** corrigir apenas o comportamento solicitado; não refatorar outros módulos por oportunidade.
2. **Preservação primeiro:** nunca descartar texto, imagens, navegação, notas, arquivos existentes ou fontes externas legítimas por heurística agressiva.
3. **Segurança e privacidade:** não enviar conteúdo para serviços externos; manter CSP e Workers compatíveis com hospedagem estática.
4. **Consentimento:** correções sensíveis do EPUB exigem confirmação ou revisão; não inventar metadados ou títulos sem base verificável.
5. **Acessibilidade:** controles devem ser operáveis com teclado e tela sensível ao toque; menus modais devem fechar com Escape e devolver o foco.
6. **Estados assíncronos:** cancelar deve interromper operação, descartar resultado tardio e não oferecer downloads incompletos.
7. **Responsividade:** testar as duas rotas e o comportamento de sobreposição/scroll em 320, 360, 390, 430 e 760 px, incluindo zoom de fonte e preferência por movimento reduzido.
8. **Dados de teste:** usar fixtures sintéticas ou materiais autorizados; nunca enviar livros pessoais completos ao repositório público.

## Testes por área

| Área modificada | Testes recomendados antes de subir |
| --- | --- |
| EPUB ZIP/OPF/NAV | Testes `tests/*Zip*`, `*Opf*`, `*Navigation*`, EPUBCheck |
| Reparo/segurança | `preservationEditorial99`, `adversarial*`, `postRepairRealContent99` |
| PDF reconstrução/metadados | `pdfConverterAnalysis`, `pdfConverterReconstruction`, `pdfConverterMetadata` |
| PDF imagem/layout | `pdfEmbeddedImages`, `pdfConverterEpub` e teste visual com PDF real |
| UI geral | `browser-smoke.mjs`, `reportLayoutRegression99.test.ts` |
| UI conversor | `browser-converter.mjs` |
| CSP/Workers | `browser-csp.mjs`, `zipWorkerCancellation99`, `zipBuildWorker99` |
| Performance/memória | `performanceBudget99`, `browser-resource-budget.mjs` |

**Vitest:** `vitest.config.ts` separa ambientes `node` e `jsdom`. Não reintroduzir comentários `@vitest-environment` que alteram contratos de execução; editar a lista/configuração quando um teste exigir DOM.

## Fluxo Git

- Mantenha `dev` como branch de desenvolvimento. `prod` deve receber mudanças por PR `dev` → `prod`, não por atualização forçada.
- Antes do push, revisar o diff completo e rodar os testes correspondentes.
- Em PR para `prod`, confira no HEAD: `Quality gate / Node 20.x`, `Quality gate / Node 22.x`, EPUBCheck e demais verificações relevantes pelos gatilhos de cada workflow.
- A política e os required checks efetivos são definidos pelo GitHub, não por este documento. Não afirmar que dispositivos físicos ou EPUBCheck são checks obrigatórios se não constarem do ruleset.
- Uma atualização de documentação não exige alteração de `package.json` nem nova tag, salvo mudança explícita de versão.
- Após merge, confira CI de `prod` e status real do deploy Netlify. Uma PR verde não equivale a deploy finalizado.
- Agrupe ajustes relacionados em um único commit/PR sempre que possível para preservar minutos de GitHub Actions.

## Checklist para pull request

- [ ] Escopo delimitado e referências de código/issue corretas.
- [ ] Sem segredos, arquivos EPUB privados, outputs binários ou `dist/` versionados indevidamente.
- [ ] Nenhuma alteração editorial não consentida.
- [ ] Testes de regressão específicos adicionados/atualizados.
- [ ] `typecheck`, lint, testes e build executados (ou limitação descrita).
- [ ] Falhas de download do runner distinguidas de falhas reais de produto.
- [ ] Rotas `/` e `/converter` revisadas quando componentes são compartilhados.
- [ ] Documentação canônica atualizada quando funcionalidade/limite/política mudou.
- [ ] PR de produção revisada com checks no HEAD e plano de rollback.

## Princípio de documentação

`README.md`, `ESTADO_ATUAL.md`, `ARQUITETURA.md`, `CONVERSOR_PDF_EPUB.md` e `DEPLOY_OPERACAO.md` descrevem **como usar/manter a versão atual**. Relatórios `AUDITORIA_*`, `RELEASE_*` e notas de release descrevem **evidências históricas**. Não corrigir um documento histórico apagando o estado real da época.

Leitura adicional: [Qualidade](QUALIDADE_TESTES.md), [CI econômica](CI_ECONOMICO.md), [Política Git](BRANCH_POLICY.md), [Segurança](SEGURANCA_E_LIMITES.md).
