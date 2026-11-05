# Decisões técnicas e changelog da auditoria

**Data-base:** 05/11/2026. Todos os commits mencionados foram aplicados na `dev`.
A branch `prod` permanece na versão estável `v2.2.0` até revisão independente.

| Decisão | Justificativa |
| --- | --- |
| Correções estruturais devem preservar o conteúdo | O reparador não é editor de obras |
| Não inventar idioma nem ordem do spine | Impede erro editorial silencioso |
| Links e fontes externas legítimas são preservados | Não são automaticamente código malicioso |
| Imagem ausente só vira marcador de texto após opt-in | Evita modificação visual inesperada |
| Índice NCX pode ser seletivo | O sumário é editorial, não enumeração do spine |
| Manifest com ID duplicado referenciado requer revisão manual | Não é possível saber qual destino foi pretendido |
| Regressões novas de erro/aviso bloqueiam saída | Evita distribuir versão pior que o original |
| EPUBCheck roda no CI, não na UI | Mantém o site local/estático e prova uma parte da conformidade |
| Não existem alegações de antivírus | Scores não são evidência de ausência de malware |

## Changelog acumulado da branch dev

- `aa4fcc4` .. `9626ff2`: melhorias da primeira execução, correções estruturais,
  segurança, testes de regressão e inventário dos 99 itens.
- `d07f27b`: gate de regressões e conteúdo ativo residual.
- `6e89b31`: preservação de recursos remotos do manifest.
- `4d5e39f`: substituição de imagens ausentes apenas por escolha explícita.
- `b9c2067`: sanitização CSS granular e preservação de fallback de fontes.
- `97d328f` / `3e46e02`: integração e ajuste da fixture do EPUBCheck.
- `0c0add7`: referências ambíguas, ciclos de fallback e Media Overlay.
- `927ae06`: rótulos editoriais em índices novos.
- `05f0dbd`: explicitar tarefas puladas e avisos no relatório.

Os commits não são releases; funcionalidades devem ser integradas em `prod` somente
após os testes restantes, revisão do diff e aprovação explícita.

## Controle de evidências

O arquivo [AUDITORIA_99_PROGRESSO.md](AUDITORIA_99_PROGRESSO.md) é a fonte de
acompanhamento por item. `Concluído · CI` significa que o comportamento entregue foi
validado pelos testes disponíveis, **não** cobertura universal de EPUBs. Novas descobertas
devem criar IDs adicionais, sem forçar o inventário original a continuar em 99.
