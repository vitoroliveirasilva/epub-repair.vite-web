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


## Auditoria independente 3: E-113 a E-122 (06/11/2026)

Critério: alterações de código e testes automatizados independem de
homologação física; os dois workflows nativos mobile são evidências separadas,
nunca tratados como sucesso enquanto não concluírem upload e download reais.

| ID | Tratamento na dev | Evidência e ressalva |
| --- | --- | --- |
| E-113 | Reparos bem-sucedidos tornam-se entrada das operações posteriores; a seleção da capa não apaga o download anterior | `tests/epub-third-wave-sequence.test.ts` valida reparo → capa → reanálise; arquivo original permanece em `originalSource` |
| E-114 | Scanner CSS agora distingue strings e comentários de recursos ativos | `tests/epub-third-wave-core.test.ts` protege texto literal `content:"url(...)"` |
| E-115 | Meta de capa apontando XHTML, ou `cover-image` aplicado a item não imagem, gera revisão; não é anunciado como capa válida | `validateCoverConsistency`, `buildCoverReportInfo`; não adivinhar nova capa |
| E-116 | Workflow iOS sem utilitário GNU `timeout` ausente no macOS | `.github/workflows/ios-simulator.yml`; execução Appium no simulador é gate separado |
| E-117 | Workflow Android usa imagem Google APIs userdebug e tenta Playwright AndroidDevice.launchBrowser quando CDP não é exposto | `.github/workflows/android-emulator.yml` e `tests/android-emulator-flow.mjs`; download nativo ainda precisa de execução confirmada |
| E-118 | CSS exclusivo para capa recebe atualização; CSS compartilhado é duplicado e só página de capa aponta à cópia | `coverReferenceScope.ts`, `forkSharedCoverStyles.ts`, testes com estilo compartilhado |
| E-119 | Primeira página `0001.xhtml` essencialmente visual é reconhecida pela imagem existente ou fundo CSS, sem inferir capa em capítulos com prosa | `tests/epub-third-wave-cover.test.ts` |
| E-120 | Exemplos Kindle são preservados em texto e anotados como informativos; somente atributos reais são reparáveis | `sanitizeHtml.ts`, `referenceExtractor.ts`, `validateContentReferences.ts` |
| E-121 | Sem `createImageBitmap`, a imagem precisa ser decodificada por `Image`; caso não exista decodificador confiável, recusa em vez de aceitar JPEG pelo cabeçalho | `tests/epub-third-wave-fallback.test.ts` |
| E-122 | Troca de capa passa pelo gate `auditPreservation` do reparo, com exceção restrita à imagem explicitamente selecionada | `replaceCover.ts`, `preservationAudit.ts`, regressões de texto, estrutura e imagens |

### Limitações conscientes

- Estilos incluídos por encadeamentos CSS `@import` complexos ou páginas de capa não identificáveis
  não devem ser reescritos por heurística agressiva. Se a associação for ambígua, preserve
  capítulos e exiba advertência, em vez de alterar conteúdos irreversivelmente.
- A aprovação de testes desktop e EPUBCheck não substitui validação real de
  downloads em iOS/Android. Não confundir falha de boot/CDP/Appium com defeito demonstrado do app.
- `prod` só pode receber as alterações após autorização específica; esta rodada altera apenas `dev`.


## Quarta auditoria: E-123 a E-131 (06/11/2026)

Todos os nove pontos desta rodada tiveram alterações no código da branch `dev`,
com testes de regressão em `tests/epub-fourth-wave.test.ts` e
`tests/epub-third-wave-cover.test.ts`. A homologação completa corresponde
aos workflows de CI do commit que introduziu estes ajustes.

| ID | Prioridade | Correção e critério de aceite |
| --- | --- | --- |
| E-123 | Alta | Exibir `Aplicar reparos restantes` junto ao download da cópia parcial quando o relatório ainda tem problemas reparáveis; não remover botão de download |
| E-124 | Alta | Uma tentativa de reparo ou otimização sem alterações não descarta `repairResult` anterior nem seu blob |
| E-125 | Crítica | Havendo problema reparável obrigatório, escolher sempre modo `repair`, ainda que limpeza EXIF tenha sido selecionada; limpeza de metadados segue opt-in |
| E-126 | Alta | Executar compatibilidade Kindle e sincronização de propriedades com o pacote OPF efetivo após inclusão de recursos órfãos, e não com o manifest original |
| E-127 | Alta | Percorrer dependências `@import` de CSS declarado e clonar a cadeia que leva à capa, mantendo CSS de capítulos intacto, inclusive em arquivos compartilhados e com imports encadeados |
| E-128 | Alta | Rejeitar JPEG com dimensões SOF inválidas ou acima do limite **antes** de `createImageBitmap`, `Image` ou conversão JPEG progressiva |
| E-129 | Média | Validar extensão, tamanho, leitura e cancelamento de novo upload **antes** de substituir o arquivo e a cópia já gerada |
| E-130 | Média | Pré-filtro de referências de capa trata escapes URI `%xx` sem diferenciar maiúsculas/minúsculas, preservando caracteres Unicode e caminhos legítimos |
| E-131 | Baixa | Extrair `@import url(...)` apenas uma vez, evitando `CSS_MISSING_RESOURCE` duplicado com contextos `css:url` e `css:import` |

### Proteções mantidas

- Fontes e URLs externas HTTPS legítimas permanecem aceitas.
- CSS original compartilhado por capítulos não é reescrito para trocar a capa;
  apenas novos recursos vinculados à página de rosto recebem as referências novas.
- Testes sintéticos de EPUB e navegador não garantem fidelidade visual absoluta
  para todos os EPUBs ou dispositivos físicos.
- A branch `prod` não foi modificada nesta rodada.


## Quinta e sexta auditorias: E-132 a E-149 (06/11/2026)

Esta rodada de desenvolvimento foi registrada exclusivamente na branch `dev`.
Evidências automatizadas: `tests/epub-audit-132-149.test.ts`,
`tests/epub-audit-upload-137.test.ts`, testes de regressão existentes,
TypeScript, ESLint, EPUBCheck, Calibre e browser matrix. Uma verificação
automatizada não é sinônimo de perfeição editorial de todos os livros.

| Itens | Alteração aplicada |
| --- | --- |
| E-132 | Reconhecer `@import url(nested.css)` e a forma com aspas sem contar a mesma URL duas vezes |
| E-133 | Identificar capa em primeira página anônima cuja imagem esteja em `<style>` ou `style` |
| E-134 | Preservar CDATA literalmente durante as transformações de XHTML |
| E-135 | Comparar URLs CSS após decodificar escapes, preservando strings e estilos compartilhados |
| E-136 | Remover somente o vínculo remoto quando solicitado, sem apagar marcação editorial interna ou duplicar entidades |
| E-137 | Diagnosticar em estado separado um novo EPUB inválido, mantendo o download e o relatório do EPUB anterior |
| E-138 | Comparar ocorrências de alertas após reparo, incluindo detalhe e multiplicidade, antes de liberar a cópia |
| E-139 | No iOS Appium, usar HTTP nativo do Node para esperar o boot do WebDriverAgent sem o limite implícito de cabeçalhos do fetch; a homologação iOS só é concluída mediante evidência real do simulador |
| E-140 | Recuperar o caminho OPF exato preservando a capitalização física no ZIP |
| E-141 | Inspecionar âncoras em `text/html` com parser HTML, incluindo arquivos `.html` |
| E-142 | Bloquear alterações em bytes DTBook sem auditoria especializada, evitando perda silenciosa de versos, páginas ou texto editorial |
| E-143 | Validar o formato do último recurso de cada cadeia de fallback e não apenas um recurso intermediário |
| E-144 | Permitir correção opcional de idioma XHTML quando o OPF declara um idioma válido, sem normalizar texto ou executar reparos amplos na otimização |
| E-145 | Apontar como reparáveis as `properties` obrigatórias de manifest que já possuem rotina de sincronização |
| E-146 | Mostrar imagem ausente como pendência dependente de consentimento; só habilitar sua substituição por texto com opt-in expresso |
| E-147 | Detectar metadados JPEG sob alias `image/jpg` e PNG `zTXt` |
| E-148 | Exigir `playOrder` NCX integralmente numérico, positivo e sem sufixos |
| E-149 | Validar dimensões JPEG pelo cabeçalho SOF na inspeção de recursos |

### Escopo preservado

- Fontes externas HTTPS legítimas e texto editorial não são removidos por presunção de insegurança.
- `prod` permanece sem alterações.
- Android e iOS têm workflows próprios; falhas de instalação do SDK,
  inicialização do Appium e download nativo são informadas separadamente.
- A proteção DTBook é deliberadamente conservadora: diante da impossibilidade
  de garantir equivalência editorial, a alteração é recusada, não improvisada.

## Sétima auditoria: E-150 a E-157 (08/11/2026)

Correções implementadas na branch `dev` em lote único, com casos em
`tests/epub-audit-150-157.test.ts`. Considere E-150 uma retificação
normativa da conclusão de E-143.

| Item | Implementação |
| --- | --- |
| E-150 | A cadeia fallback EPUB 3.3 é válida quando **algum** recurso intermediário é core; não precisa terminar em core |
| E-151 | O validador CSS resolve caminhos locais após decodificar escapes CSS |
| E-152 | O diretório central retém a identidade do caminho ZIP inseguro e ignora a entrada voluntariamente descartada na verificação de divergência JSZip; arquivos seguros não desaparecem |
| E-153 | JPEG com SOI sem quadro SOF decodificável recebe aviso próprio, sem reescrever imagem |
| E-154 | Clock-values SMIL exigem minutos/segundos dentro dos limites de formato |
| E-155 | OGG só é core EPUB 3.3 com MIME `audio/ogg; codecs=opus` |
| E-156 | Verifica duração global, individual por `refines`, duplicação e divergência superior a um segundo, sem inventar tempos editoriais |
| E-157 | O usuário pode exportar TXT e JSON do EPUB recusado separadamente, sem confundir com o livro anterior |

As mudanças não modificam imagens ou conteúdo editorial automaticamente fora dos
reparos já autorizados. A homologação nativa Safari iOS continua independente
e não pode ser marcada aprovada sem evidência real.

Para reduzir as execuções do GitHub Actions, consultar
`docs/CI_ECONOMICO.md`: a `dev` utiliza CI rápida, enquanto os workflows
pesados são concentrados em PR para `prod` ou execução manual.
