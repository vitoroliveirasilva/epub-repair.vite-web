# Estratégia econômica de CI e homologação

A branch de desenvolvimento é `dev`. A publicação depende da `prod`, protegida pelo
ruleset **Protect prod**, que exige os contextos de qualidade de Node.js 20 e 22.

## Gatilhos

| Gatilho | O que roda | Objetivo |
| --- | --- | --- |
| Push em `dev` | CI de qualidade em Node.js 22 | Lint, TypeScript, testes e build com feedback rápido |
| Alteração de dependências | Supply-chain, nos gatilhos já existentes | Verificar origem, licenças e vulnerabilidades |
| PR **pronta** para `prod` | Node 20/22, EPUBCheck, Calibre, navegador Chromium/Firefox/WebKit, cobertura (conforme filtros) e Netlify HTTPS | Testar a candidata ANTES do merge. Rascunhos não disparam suítes pesadas |
| Push em `prod` | CI completa, EPUBCheck, Calibre, navegadores, cobertura e release protegido | Verificar o pacote publicado; mobile e Kindle seguem homologação manual |
| `workflow_dispatch` | Somente o workflow escolhido (inclusive iOS, Android, Kindle e EPUBCheck) | Homologar pontualmente sem iniciar toda a matriz |
| Cron semanal | Auditorias de dependências existentes | Verificações recorrentes, fora do ciclo de commits |

**Importante:** publicar alterações somente em `dev` durante o desenvolvimento.
A antiga PR #32 foi encerrada e **não é candidata de release**.
A candidata `v2.4.0` deve ter uma nova PR `dev` → `prod`,
inicialmente **draft / NÃO MERGEAR**. Rascunhos não repetem a
matriz Node 20/22: apenas o push na `dev` executa a CI rápida.
Marcar **Ready for review** inicia a homologação completa, e não
significa autorização de merge ou promoção para `prod`.
Ver `docs/RELEASE_2_4_0_CANDIDATA.md`.
Os workflows de **Calibre, navegadores e cobertura agora rodam automaticamente apenas em PRs para `prod` que não estejam em rascunho**, quando arquivos relevantes mudarem, além do push final em `prod`. EPUBCheck também roda na PR pronta. Kindle Previewer e emuladores iOS/Android permanecem manuais. Evitar abrir PR pronta até terminar os lotes de correção; uma sincronização de PR pronta dispara novamente a homologação pertinente.

## Regras para economizar

1. Auditorias somente leitura não geram commits nem acionam GitHub Actions.
2. Agrupar correções e testes antes do push. Evitar sequências de commits para arquivos individuais.
3. Se a CI rápida falhar, corrigir a causa com a menor alteração possível; não reiniciar
   Android, iOS, Calibre, navegadores ou Kindle sem evidência de necessidade.
4. iOS/Android/Kindle continuam sob demanda em Actions > Run workflow. Calibre,
   navegadores e cobertura também podem rodar manualmente na `dev`, mas passam a
   validar automaticamente as PRs **não draft** de release para `prod`.
   Nenhuma suíte pesada é acionada na atualização de uma PR de rascunho.
5. Falhas de download do SDK, indisponibilidade de simulador e timeout do
   WebDriverAgent devem ser relatados como problemas de infraestrutura até haver
   prova de falha do aplicativo.
6. O `workflow_run` de release continua condicionado ao CI bem-sucedido
   no push da `prod`; não disparar releases a partir de `dev`.
7. O workflow Netlify HTTPS pode rodar manualmente informando o número da PR,
   ou na abertura/reabertura de uma PR pronta para revisão. Rascunhos não
   acionam esse job de forma repetida.
8. `Supply-chain` roda na PR apenas quando dependências, scripts de auditoria
   ou o próprio workflow são alterados; o agendamento semanal é preservado.
9. EPUBCheck pode rodar manualmente em `dev` e passa obrigatoriamente pela CI da
   PR **pronta** para `prod`, além do push final de produção. Não roda em PR draft.

## Critérios de encerramento de auditoria

- Nenhum defeito de alta/média prioridade conhecido sem correção ou justificativa.
- Regressões determinísticas cobrindo as mudanças, inclusive preservação de texto.
- Suíte rápida verde em `dev`.
- Homologação **pré-merge** da candidata em PR pronta, com Node 20/22,
  EPUBCheck, navegadores, Calibre, cobertura e preview HTTPS verdes no HEAD exato.
  Dispositivos físicos iOS/Android e Kindle Previewer continuam requisitos de
  homologação específica, registrados como aprovados, limitados ou pendentes.
- Checks de Node.js 20 e 22 aprovados na PR pronta para revisão antes de qualquer merge.
  Atenção: checks ignorados na PR em rascunho não são aprovação; não promover.
- Duas auditorias consecutivas sem novo defeito relevante, registrando limitações.

A CI verde mede apenas os casos cobertos. Não significa prova matemática de
ausência de bugs nem substitui revisão editorial de EPUBs complexos.

> Os workflows manuais podem precisar existir primeiro na branch padrão `prod`
> para que o botão Run workflow seja oferecido pelo GitHub. Até a promoção,
> conferir a disponibilidade antes de depender de execução manual para homologar.

## Lacuna de proteção GitHub ainda conhecida

O ruleset de `prod` exige de forma automática apenas os status Node.js 20 e 22.
Os demais verificadores agora rodam **antes** do merge, mas **não são required
checks no ruleset**. Não declarar uma PR de release aprovada apenas porque GitHub
mostra botão verde: conferir manualmente EPUBCheck, browser matrix, Calibre,
cobertura e Netlify CSP no commit candidato. Tornar esses checks obrigatórios
no ruleset exige alteração administrativa específica. Esta documentação não
finge que a configuração já foi aplicada.
