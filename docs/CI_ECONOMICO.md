# Estratégia econômica de CI e homologação

A branch de desenvolvimento é `dev`. A publicação depende da `prod`, protegida pelo
ruleset **Protect prod**, que exige os contextos de qualidade de Node.js 20 e 22.

## Gatilhos

| Gatilho | O que roda | Objetivo |
| --- | --- | --- |
| Push em `dev` | CI de qualidade em Node.js 22 | Lint, TypeScript, testes e build com feedback rápido |
| Alteração de dependências | Supply-chain, nos gatilhos já existentes | Verificar origem, licenças e vulnerabilidades |
| PR **pronta** para `prod` | Checks obrigatórios Node.js 20 e 22 | Proteger o ruleset; PR em rascunho não duplica a execução a cada sincronização |
| Push em `prod` | CI completa, EPUBCheck, Calibre, navegadores, cobertura e release protegido | Verificar o pacote publicado; mobile e Kindle seguem homologação manual |
| `workflow_dispatch` | Somente o workflow escolhido (inclusive iOS, Android, Kindle e EPUBCheck) | Homologar pontualmente sem iniciar toda a matriz |
| Cron semanal | Auditorias de dependências existentes | Verificações recorrentes, fora do ciclo de commits |

**Importante:** publicar alterações somente em `dev` durante o desenvolvimento.
A PR #32 é um rascunho de homologação `dev` → `prod`, marcada NÃO MERGEAR.
Ela já existe e sincroniza automaticamente com cada push na `dev`.
PR em rascunho não repete os dois checks Node 20/22: usa apenas a CI rápida do push na `dev`.
Ao marcar **Ready for review**, os dois checks voltam a rodar automaticamente.
Os workflows pesados são **manuais**, mesmo quando há PR aberta.
Executar a matriz completa manualmente somente ao encerrar um lote e antes de qualquer promoção.

## Regras para economizar

1. Auditorias somente leitura não geram commits nem acionam GitHub Actions.
2. Agrupar correções e testes antes do push. Evitar sequências de commits para arquivos individuais.
3. Se a CI rápida falhar, corrigir a causa com a menor alteração possível; não reiniciar
   Android, iOS, Calibre, navegadores ou Kindle sem evidência de necessidade.
4. Testes iOS/Android/Kindle, Calibre, navegadores e cobertura ficam disponíveis
   sob demanda pela aba Actions > Run workflow na branch `dev`.
   Nenhum deles é acionado pela atualização da PR de rascunho.
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
9. O EPUBCheck pode ser disparado manualmente no workflow CI em `dev`;
   também roda em push de `prod`, sem repetir a cada atualização de PR.

## Critérios de encerramento de auditoria

- Nenhum defeito de alta/média prioridade conhecido sem correção ou justificativa.
- Regressões determinísticas cobrindo as mudanças, inclusive preservação de texto.
- Suíte rápida verde em `dev`.
- Homologação completa **manual antes da promoção** para `prod`, com registros
  de iOS, Android, Kindle, navegadores, Calibre, EPUBCheck e cobertura.
- Checks de Node.js 20 e 22 aprovados na PR pronta para revisão antes de qualquer merge.
  Atenção: checks ignorados na PR em rascunho não são aprovação; não promover.
- Duas auditorias consecutivas sem novo defeito relevante, registrando limitações.

A CI verde mede apenas os casos cobertos. Não significa prova matemática de
ausência de bugs nem substitui revisão editorial de EPUBs complexos.

> Alguns workflows manuais podem precisar existir primeiro na branch padrão `prod`
> para que o botão Run workflow seja oferecido pelo GitHub. Até a promoção,
> conferir a disponibilidade antes de depender de execução manual para homologar.
