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

## Execução 4: decisões e limitações verificadas

- Rejeitar arquivos ZIP ambíguos (registros duplicados/sobrepostos) em vez de fazer
  escolhas destrutivas; nenhuma entrada é automaticamente escolhida para sobrescrever outra.
- Tratar EPUB 2 e EPUB 3 separadamente no corpus oficial EPUBCheck.
- Considerar `originalSource` imutável durante substituição de capa e registrar
  `lastRepairOptions` apenas para reparos aplicados, separando-os das opções atuais.
- Manter sumário editorial toc/page-list/landmarks: diagnosticar, não recriar
  estruturas existentes apenas porque sua semântica diverge do esperado.
- Neutralizar CSS ativo por declaração quando seguro; uma falha de sanitização
  ainda deve bloquear ou sinalizar revisão, não assumir ausência de risco.
- Informar usuários antes de transformações visíveis.
- Inventariar licenças de dependências em CI como evidência operacional e não
  como parecer de conformidade jurídica.

Resultado desta execução: **26 concluídos, 50 parciais, 23 pendentes** de 99,
com CI Node 20/22, EPUBCheck 5.4.0 e testes sintéticos. A `prod` segue intacta.

## Execuções 5 e 6: decisões técnicas

- ZIP/OCF: recusar e diagnosticar ZIP64, arquivos multipartes, compressões incompatíveis, descritores, CRC e tamanhos divergentes antes de confiar em arquivos extraídos.
- EPUB 3 fixed-layout: verificar dimensões e viewport, não redimensionar nem alterar visual de página automaticamente.
- SMIL: verificar destino textual, fragmentos, presença de áudio e limites temporais, sem sintetizar ou recodificar narração.
- A auditoria editorial protege ordem de capítulos, blocos XHTML, âncoras, links NCX e semântica MathML/ruby/RTL, mas ainda não comprova fidelidade visual em leitores físicos.
- O diagnóstico de scripts distingue JS declarado de recurso órfão. O EPUB 3 admite conteúdo ativo e o relatório não afirma presença de malware por causa de um script legítimo.
- Executáveis com assinatura conhecida, mesmo sob extensão enganosa, são avisados e não removidos automaticamente.
- A identificação de CSS redundante ou sobrescrito é informativa: a cascata pode ser intencional, e a ferramenta não reescreve sua apresentação por hipótese.
- O relatório agora permite conferir diferenças limitadas por linha de OPF/XHTML/CSS/NCX, mantendo a leitura e a produção de relatórios locais.
- A preservação de foco após rerender e propriedades de no-op/idempotência receberam regressões dedicadas.
- Não fazer merge de `dev` em `prod` nem release automático a partir deste inventário. `prod` continua em `v2.2.0`.

Para evidências e estados individuais, ver [Auditoria 99](AUDITORIA_99_PROGRESSO.md).

## Execução 8: segurança e múltiplas renditions

- Scripts e recursos EPUB 3 legítimos podem ser mantidos por decisão explícita; continuam rastreados como revisão manual caso não sejam neutralizados. A interface não equipara recurso JavaScript a malware.
- XHTML/CSS/SVG não declarados são inspecionados sem executar nem apagar seu conteúdo; XML/encoding inválido mantém alerta.
- Referências só são avaliadas em atributos DOM reais e texto visível, não em comentários ou exemplos escapados da obra.
- A presença de vários rootfiles em `container.xml` **não é motivo para reconstruí-lo**: isto anteriormente perdia edições secundárias. Foram adicionados testes byte a byte do container e dos recursos de outras renditions.
- Manifests de edições secundárias não serão mesclados ao OPF ativo sem decisão editorial.
- A CSP atual proíbe Workers enquanto o item E-032 não está implementado.
- Todos os 12 P0 estão encerrados no escopo automatizado definido, **sem substituir auditoria de segurança, antivírus ou testes em leitores físicos**.

Referência completa: [Auditoria 99 / execução 8](AUDITORIA_99_PROGRESSO.md).
