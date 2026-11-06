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

## Rodada complementar de 06/11/2026: E-102 a E-112

As alterações abaixo foram implementadas **na branch dev**, com cobertura específica
em `tests/post99-hardening.test.ts` e `tests/post99-coverNavigation.test.ts`.
A classificação de 97/99 da auditoria original continua independente destes itens.
A conclusão formal dos itens depende do gate final de CI na revisão publicada.

| ID | Prioridade | Tratamento |
| --- | --- | --- |
| E-102 | Alta | Preservar imagens raster `data:` passivas em `url()` CSS, sem liberar SVG/HTML executável |
| E-103 | Alta | Limpeza opt-in de EXIF/XMP/Photoshop durante reparo, autorizando somente a transformação binária exata comprovada pela auditoria |
| E-104 | Alta | Não sobrescrever imagem de capa também usada como ilustração em capítulos; gerar arquivo separado e atualizar somente as páginas de capa identificáveis |
| E-105 | Alta | Ignorar URLs escritas em comentários CSS no inventário de recursos |
| E-106 | Alta | Evitar colisão na geração de `nav.xhtml` ou `toc.ncx` quando o caminho físico já existe |
| E-107 | Média | Não tentar decodificar XHTML/CSS não relacionados à capa quando carregam encoding legado |
| E-108 | Média | Reconhecer `url("cover(2026).png")` e preservar comentários/strings CSS não executáveis |
| E-109 | Média | Preservar exemplos literais de tags em comentários XHTML durante o saneamento |
| E-110 | Média | Bloquear reempacotamento e troca de capa de EPUBs com `META-INF/signatures.xml` para não invalidar assinatura digital |
| E-111 | Média | Computar conteúdo ativo não declarado no score de segurança, sem penalizar JavaScript EPUB3 declarado e legítimo |
| E-112 | Alta | Referência editorial `href` com alvo local ausente não é reparável automaticamente; exige revisão real do link |

### Limites e critérios de preservação

- O modo de troca de capa tenta reconhecer a página de rosto por `guide`,
  `landmarks` ou nome inequívoco do arquivo. Quando uma ilustração é compartilhada,
  os demais capítulos permanecem intocados e é exibido aviso para conferência.
- Assinaturas digitais: não se remove nem recria assinatura. O original permanece
  intocado, e a operação que a invalidaria é recusada.
- Links externos HTTP/HTTPS, fontes remotas legítimas e scripts EPUB3 declarados
  continuam sem classificação automática como malware.
- Os testes sintéticos e EPUBCheck não substituem conferência visual em livros
  reais e leitores físicos. E-082 e E-089 continuam como testes físicos não
  comprovados; não são defeitos demonstrados da aplicação.
- Nenhuma alteração foi aplicada diretamente à branch `prod`.
