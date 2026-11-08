# Estratégia econômica de CI e homologação

A branch de desenvolvimento é `dev`. A publicação depende da `prod`, protegida pelo
ruleset **Protect prod**, que exige os contextos de qualidade de Node.js 20 e 22.

## Gatilhos

| Gatilho | O que roda | Objetivo |
| --- | --- | --- |
| Push em `dev` | CI de qualidade em Node.js 22 | Lint, TypeScript, testes e build com feedback rápido |
| Alteração de dependências | Supply-chain, nos gatilhos já existentes | Verificar origem, licenças e vulnerabilidades |
| PR para `prod` | CI Node.js 20/22, EPUBCheck, cobertura, navegadores, Calibre, Android, iOS, Kindle e proteções pertinentes | Homologação completa antes da promoção |
| Push em `prod` | CI completa, checks e publicação somente após êxito | Proteger versão publicada |
| `workflow_dispatch` | Apenas workflow escolhido | Reexecutar testes direcionados sem disparar a matriz inteira |
| Cron semanal | Auditorias de dependências existentes | Verificações recorrentes, fora do ciclo de commits |

**Importante:** publicar alterações somente em `dev` durante o desenvolvimento.
Não abrir PR para `prod` a cada correção parcial; consolidar e verificar o conjunto.

## Regras para economizar

1. Auditorias somente leitura não geram commits nem acionam GitHub Actions.
2. Agrupar correções e testes antes do push. Evitar sequências de commits para arquivos individuais.
3. Se a CI rápida falhar, corrigir a causa com a menor alteração possível; não reiniciar
   Android, iOS, Calibre, navegadores ou Kindle sem evidência de necessidade.
4. Testes iOS/Android/Kindle ficam disponíveis sob demanda pela aba Actions,
   com `Run workflow` sobre a `dev`, e são acionados automaticamente na
   homologação para `prod`.
5. Falhas de download do SDK, indisponibilidade de simulador e timeout do
   WebDriverAgent devem ser relatados como problemas de infraestrutura até haver
   prova de falha do aplicativo.
6. O `workflow_run` de release continua condicionado ao CI bem-sucedido
   no push da `prod`; não disparar releases a partir de `dev`.

## Critérios de encerramento de auditoria

- Nenhum defeito de alta/média prioridade conhecido sem correção ou justificativa.
- Regressões determinísticas cobrindo as mudanças, inclusive preservação de texto.
- Suíte rápida verde em `dev`.
- Homologação completa na proposta de promover para `prod`.
- Duas auditorias consecutivas sem novo defeito relevante, registrando limitações.

A CI verde mede apenas os casos cobertos. Não significa prova matemática de
ausência de bugs nem substitui revisão editorial de EPUBs complexos.
