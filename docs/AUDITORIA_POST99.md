# Auditoria complementar pós-99: correções e homologação

**Branch:** dev (produção v2.2.0 preservada)

## E-100 — troca de capa com formato diferente

Corrigir sincronização de referências à capa original quando um arquivo novo
precisa ser criado por mudança JPEG/PNG. Atualização de caminhos exatos em
XHTML/HTML/SVG/CSS e guide, preservando URLs remotas, texto, arquivos de
imagem originais e destinos sem relação com a capa.

**Evidência:** testes em `tests/coverReplacementReferences.test.ts`,
incluindo reparo real do EPUB sintético e inspeção do ZIP resultante.
O CI confirma o comportamento implementado, não a aparência em todos os leitores.

## E-101 — saída com reparos obrigatórios residuais

Toda cópia com erros/avisos ainda reparáveis deve aparecer como
**cópia parcial (revisar)**, mesmo quando nenhuma pendência não reparável
permanece. Melhorias opcionais `info` não impedem prontidão.

**Evidência:** `tests/workflowAndScore99.test.ts`.

## Pendências externas ao código

- E-082: Safari e download EPUB em iPhone/iPad físicos.
- E-089: Chrome e Firefox em hardware Android físico.
- Compatibilidade editorial de livros reais, Apple Books e Kindle físico.
- Validar `dev` via CI antes de considerar os novos itens concluídos.

Esses testes externos não devem ser marcados como executados por uma alteração
de código, por emulação ou por uma execução isolada do EPUBCheck.
