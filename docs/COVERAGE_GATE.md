# Cobertura instrumentada de módulos críticos (E-095)

**Estado atual em 12/11/2026:** cobertura automatizada em `.github/workflows/coverage.yml` para cinco módulos específicos do motor EPUB. **Não** é um percentual global do projeto nem mede o conversor PDF por completo.

## Gatilhos corretos

O workflow roda em **push `prod`**, **PR não draft para `prod`** com `paths` relevantes e **`workflow_dispatch`**. O YAML atual **não** executa o gate automaticamente em todo push `dev` ou PR para `dev`.

O runner instala o app por `npm ci` e prepara `@vitest/coverage-v8@4.1.12` em harness separado para gerar o relatório V8. Consulte o workflow antes de mudar a versão do Vitest.

## Limiares em `vitest.config.ts`

| Métrica | Limiar individual |
| --- | ---: |
| Linhas | 88% |
| Statements | 85% |
| Branches | 70% |
| Funções | 82% |

Com `perFile: true`, cada módulo abaixo precisa satisfazer os limiares:

- `src/epub/utils/pathUtils.ts`
- `src/epub/reader/rawZipInspector.ts`
- `src/epub/validation/validateNavigation.ts`
- `src/epub/sanitize/sanitizeActiveContent.ts`
- `src/epub/repair/preservationAudit.ts`

A saída `coverage/coverage-summary.json` é processada por `scripts/report-coverage.mjs` e, quando disponível, publicada como artifact `epub-critical-coverage` por até **14 dias**.

## Evidência histórica

- [CI 42142342105](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42142342105): medição inicial que orientou elevação dos limiares.
- [CI 42143349561](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42143349561) e [42144065795](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42144065795): confirmações daquela fase.

Percentuais históricos de um commit não substituem o resultado do HEAD de uma PR nova. Cobertura alta não certifica segurança, fidelidade editorial ou compatibilidade Kindle/Apple Books. Veja [Qualidade e testes](QUALIDADE_TESTES.md).
