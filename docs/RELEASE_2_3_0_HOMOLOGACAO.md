# Critérios de promoção para v2.3.0

Data de preparação: 08/11/2026. Branch de origem: `dev`. Destino: `prod`.

## Evidências antes da abertura da PR de release

- Último commit base auditado: `cbcf2136620cb6dc6a4aa4ebd76fdff2c340ff75`.
- CI rápida de Node 22 no commit base: [run 42449716042](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42449716042), **526 testes aprovados**, lint, typecheck e build.
- Auditoria SBOM/licenças/OSV no commit base: [run 42449716247](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42449716247), aprovada.
- Antes do commit de preparação, últimas execuções de navegadores, Calibre, Kindle, cobertura e política de release na revisão `3093efc` estavam aprovadas. Isso não substitui CI no novo HEAD.
- Última execução iOS Simulator na revisão `3093efc`: [run 42449180603](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42449180603) falhou ao abrir a URL pelo `simctl` (timeout, antes do teste Appium de upload/download). Não declarar homologado.
- Auditoria dos 99: **97 concluídos**, **2 parciais** (E-082 e E-089), **0 não iniciados**. Fechamento requer teste em hardware físico.

## Bloqueadores automáticos de promoção

1. `package.json`, `package-lock.json` e `packages[""].version` devem indicar `2.3.0`.
2. PR independente de release, não reutilizar a PR #32 explicitamente destinada à homologação sem merge.
3. Exigir checks verdes `Quality gate / Node 20.x` e `Quality gate / Node 22.x` no HEAD exato da PR. Não aceitar `skipped` como aprovado.
4. Validar resultado de previews Netlify/CSP; qualquer falha crítica bloqueia promoção.
5. Após merge, conferir o `push prod`, EPUBCheck 5.4.0, publicação da release `v2.3.0` e deploy em Netlify antes de declarar produção atualizada.

## Riscos conhecidos aceitos para uma candidata de publicação

- Ausência de homologação em iPhone/iPad físico e Android físico: **E-082 e E-089 continuam parciais**, não são ocultados ou marcados concluídos por falta de evidência.
- Compatibilidade editorial e ausência de malware não são certificações universais.
- Para encerrar esses itens depois do lançamento, executar [a matriz física](HOMOLOGACAO_MOBILE_REAL.md) com evidência de arquivos EPUB efetivamente salvos/abertos.

A versão deve ser anunciada como publicada **somente após todas as evidências de produção**; um PR aberto ou CI de desenvolvimento verde não significa deploy.
