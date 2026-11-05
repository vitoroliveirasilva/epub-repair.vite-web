# Andamento da auditoria de 99 itens

**Última atualização:** 05/11/2026 (execução 10, CI Node 20/22 e EPUBCheck aprovada) · **Branch de trabalho:** `dev` · **Produção:** `prod` preservada na v2.2.0.

Este arquivo acompanha o [inventário integral](./AUDITORIA_99_BASE.md). O progresso aqui indica escopo entregue com CI ou avançado parcialmente, **não uma certificação global de segurança ou compatibilidade**.

| Situação | Itens |
| --- | ---: |
| Concluídos no escopo definido, com CI Node 20/22 aprovada | **75** |
| Parcialmente tratados, com testes/validação adicionais necessários | **21** |
| Não iniciados ou ainda não evidenciados | **3** |
| Total | **99** |

## Regras de classificação

- **Concluído · CI:** o critério principal foi implementado e a CI automatizada da `dev` passou. Ainda cabe validação com leitores e livros reais quando aplicável.
- **Parcial:** há código ou testes novos, mas o critério integral do inventário ainda não foi demonstrado.
- **Pendente:** nenhuma evidência suficiente para dar o item como tratado.
- Nenhuma mudança editorial é considerada segura apenas porque o projeto compila.
- Links e fontes HTTP/HTTPS legítimos permanecem preservados por padrão.
- A navegação NCX não precisa listar um ponto por arquivo do spine.
- Não publicar EPUBs comerciais como fixtures no repositório público.

## Progresso por item

| ID | Prioridade | Descrição | Estado |
| --- | --- | --- | --- |
| E-001 | P0 | Mensagem de “EPUB pronto” quando só restam erros/avisos não reparáveis | Concluído · CI |
| E-002 | P0 | Destino inexistente no NCX é marcado reparável, mas o reparo não corrige o destino | Concluído · CI |
| E-003 | P0 | NCX declarado, ausente e removido do manifest pode ser recriado sem voltar ao manifest | Concluído · CI |
| E-004 | P0 | Recurso órfão adicionado ao manifest não passa pela sanitização deste mesmo reparo | Concluído · CI |
| E-005 | P0 | Decodificação e corte de #/? usados em nomes físicos de ZIP | Concluído · CI |
| E-006 | P0 | Resultado final revalidado pode ser liberado mesmo com erros críticos ou regressões | Concluído · CI |
| E-007 | P1 | Detecção de MIME por extensão pode reescrever MIME válido (ex.: fontes OpenType) | Concluído · CI |
| E-008 | P1 | Idioma pt-BR usado sem comprovação quando metadado falta ou é inválido | Concluído · CI |
| E-009 | P1 | JPEG progressivo pode ser convertido no mesmo fluxo de reparo obrigatório | Concluído · CI |
| E-010 | P1 | Spine vazio é reconstruído seguindo a ordem do manifest, não a ordem editorial | Concluído · CI |
| E-011 | P1 | Gerador de nav e NCX usa IDs/nomes de arquivos como títulos de sumário | Concluído · CI |
| E-012 | P1 | Gerador NCX pode emitir navPoint com src vazio quando não há documentos elegíveis | Concluído · CI |
| E-013 | P1 | Renomear IDs duplicados do manifest não atualiza todas as referências dependentes | Concluído · CI |
| E-014 | P1 | URI remota legítima em item do manifest pode ser tratada como caminho local ausente | Concluído · CI |
| E-015 | P1 | CSS com url() inválida substituída por none pode produzir declaração inválida em @font-face | Concluído · CI |
| E-016 | P1 | CSS perigoso embutido pode causar remoção de todo o elemento style | Concluído · CI |
| E-017 | P1 | Marcador de referência ausente substitui imagem, alterando texto/layout sem prévia | Concluído · CI |
| E-018 | P1 | O score de segurança pode ficar 100 mesmo quando há falha fatal ZIP_RESOURCE_LIMIT | Concluído · CI |
| E-019 | P1 | Troca de capa é disponibilizada sem gate equivalente sobre a validação final | Concluído · CI |
| E-020 | P2 | README exibe badge versão 2.0.0 embora package e release sejam 2.2.0 | Concluído · CI |
| E-021 | P1 | Nomes de entrada ZIP não UTF-8 e sinalização de encoding em flags | Parcial |
| E-022 | P1 | Caminhos com %23, %25, %2F, #, ?, Unicode NFC/NFD | Concluído · CI |
| E-023 | P1 | Colisões depois de decodificação, normalização ou diferença de caixa | Concluído · CI |
| E-024 | P1 | Consistência entre nomes do diretório central e nomes vistos pelo JSZip | Concluído · CI |
| E-025 | P1 | Extra fields Unicode, data descriptors, tamanhos e offsets extremos | Concluído · CI |
| E-026 | P1 | Sobreposição de payload ZIP, entrada duplicada e polyglots | Concluído · CI |
| E-027 | P1 | Arquivos e diretórios com nomes especiais ou caminhos relativos anômalos | Concluído · CI |
| E-028 | P1 | EPUB multipartes/ZIP64/criptografia rejeitados com diagnóstico preciso | Concluído · CI |
| E-029 | P1 | Manifest e container com múltiplos rootfiles/renditions | Concluído · CI |
| E-030 | P1 | mimetype duplicado, diretórios primeiro, extras e arquivos de tamanho zero | Concluído · CI |
| E-031 | P1 | Picos de memória ao carregar/decompactar/revalidar várias vezes | Parcial |
| E-032 | P2 | Progresso, cancelamento e execução em Worker para EPUBs grandes | Parcial |
| E-033 | P2 | Preservação de encoding/declaracão XML ao reescrever XHTML/OPF | Concluído · CI |
| E-034 | P2 | Tamanhos declarados ZIP diferentes dos fluxos descompactados | Concluído · CI |
| E-035 | P0 | EPUBCheck oficial integrado à validação de arquivos reparados no CI | Concluído · CI |
| E-036 | P1 | Matriz separada EPUB 2, EPUB 3.0/3.2/3.3 e EPUB 3.4 | Parcial |
| E-037 | P1 | Links internos com fragmento inexistente (#id) | Concluído · CI |
| E-038 | P1 | Links de nav.xhtml e seus fragmentos, hierarquia toc e estrutura de lista | Concluído · CI |
| E-039 | P1 | NAV/NCX com URLs escapadas, fragmentos, âncoras internas e caracteres especiais | Concluído · CI |
| E-040 | P1 | Suporte a page-list, landmarks e guide sem destruí-los | Concluído · CI |
| E-041 | P1 | Validação de fallback e ciclos de referência de recursos foreign | Concluído · CI |
| E-042 | P1 | Validar propriedades required do manifest: nav, cover-image, scripted, remote-resources etc | Concluído · CI |
| E-043 | P1 | Metadados package unique-identifier, dcterms:modified, prefix, refines e vínculos | Concluído · CI |
| E-044 | P1 | Spine linear, page-progression-direction, documentos estrangeiros e fallbacks | Concluído · CI |
| E-045 | P1 | Controle de arquivos remotos permitidos por tipo, propriedade e versão | Concluído · CI |
| E-046 | P1 | Fontes obfuscadas/legalmente ofuscadas e META-INF/encryption.xml | Concluído · CI |
| E-047 | P1 | Media Overlays/SMIL, sincronização de áudio e vídeos, quando presentes | Concluído · CI |
| E-048 | P1 | Metadados fixed-layout e documentos SVG no spine | Concluído · CI |
| E-049 | P2 | MathML, ruby, RTL, escrita vertical e idiomas mistos | Parcial |
| E-050 | P2 | Declarações de imagem de capa em OPF/guide/nav/cover-image | Concluído · CI |
| E-051 | P0 | Verificação dos arquivos JS/binários não mencionados no fluxo de sanitização | Concluído · CI |
| E-052 | P0 | Sanitização de todo conteúdo ativo em cada modo de reparo, inclusive conservador | Concluído · CI |
| E-053 | P1 | Atributos URL que usam entidades, controles, espaços e codificações alternativas | Concluído · CI |
| E-054 | P1 | CSS url(), @import, escapes e comentários com sintaxe adversarial | Parcial |
| E-055 | P1 | SVG com URI/script/eventos/namespace e recursos incorporados | Parcial |
| E-056 | P1 | XML com DTD/XInclude/entidades externas e DOCTYPE incomum | Concluído · CI |
| E-057 | P1 | data: image/font (passivo) versus data: HTML/SVG executável | Concluído · CI |
| E-058 | P1 | Detectar MIME por assinatura para anexos suspeitos (sem executar arquivos) | Concluído · CI |
| E-059 | P1 | Scan AV opcional fora do navegador, sem alegar antivírus integrado | Parcial |
| E-060 | P1 | Modelo de ameaças EPUB e checklist de privacidade de recursos externos | Concluído · CI |
| E-061 | P1 | Separar score de segurança de inspeção de conformidade e de integridade | Concluído · CI |
| E-062 | P2 | Headers CSP/Netlify e comportamento de previews/blob/data em navegadores | Parcial |
| E-063 | P2 | Fuzzing determinístico de ZIP/XML/SVG/CSS/OPF e limites contra ReDoS | Parcial |
| E-064 | P0 | Comparar texto integral pré/pós e avisar alterações não previstas | Concluído · CI |
| E-065 | P0 | Comparar ordem de leitura, capítulos, IDs e links antes/depois | Concluído · CI |
| E-066 | P1 | Verificar integridade binária das imagens/fontes que não deveriam ser alteradas | Concluído · CI |
| E-067 | P1 | Validar imagens por dimensões, assinatura, decodificação e pixels quando alteradas | Parcial |
| E-068 | P1 | Consertos de headings, capítulos, títulos de navegação e sumários editoriais | Parcial |
| E-069 | P1 | Detectar OCR malformado, quebras artificiais, hifens, cabeçalhos e rodapés | Parcial |
| E-070 | P1 | Diagnóstico de CSS redundante/contraditório ou referências de estilos quebradas | Concluído · CI |
| E-071 | P1 | Notas de rodapé, backlinks, endnotes, índices e remissões internas | Concluído · CI |
| E-072 | P1 | Acessibilidade editorial: alt, lang, semântica, nav e leitura assistiva | Parcial |
| E-073 | P1 | Fluxo antes/depois com diffs de XHTML, CSS, OPF e NCX | Concluído · CI |
| E-074 | P2 | Preservar tipografia, itálicos, travessões, espaçamento e estilos de diálogo | Concluído · CI |
| E-075 | P2 | Tratamento opcional de EXIF/XMP/Photoshop/metadata de imagens | Parcial |
| E-076 | P2 | Checagem de apresentação em leitores reflowable/fixed layout, imagens e fontes | Pendente |
| E-077 | P1 | Estados explícitos: seguro para reparar, revisão manual, parcial, otimização, inválido | Concluído · CI |
| E-078 | P1 | Prévia e confirmação de operações destrutivas antes de executar | Concluído · CI |
| E-079 | P1 | Indicador de ações não aplicadas e pendências remanescentes por item | Concluído · CI |
| E-080 | P1 | Fila e interrupção de tarefas grandes, feedback de processamento real | Parcial |
| E-081 | P1 | Trocar de arquivo/opções enquanto análise ainda está em execução | Concluído · CI |
| E-082 | P1 | Download blob em Safari/iOS, liberação imediata de ObjectURL | Parcial |
| E-083 | P2 | Teclado, leitor de tela e foco após rerender completo | Concluído · CI |
| E-084 | P2 | Exportar relatório técnico com prova de versão, opções e hash do original | Concluído · CI |
| E-085 | P2 | Manual de limitações (correção técnica vs editorial vs antivírus vs EPUBCheck) | Concluído · CI |
| E-086 | P0 | Corpus de EPUBs sintéticos derivado dos defeitos reais observados nos chats | Concluído · CI |
| E-087 | P1 | CI executa em push para prod e PR para prod, não em push para dev | Concluído · CI |
| E-088 | P1 | Workflow release manual aceita disparo sem condição de sucesso da CI | Concluído · CI |
| E-089 | P1 | Matriz de browsers Chromium/Firefox/WebKit e dispositivos móveis | Pendente |
| E-090 | P1 | Matriz de leitores: Kindle Previewer, Calibre e leitores EPUB 2/3 | Parcial |
| E-091 | P1 | Regressão diferencial: EPUBCheck original × reparado | Concluído · CI |
| E-092 | P1 | Validação pós-reparo de conteúdo real e links, não só ZIP/OPF | Concluído · CI |
| E-093 | P1 | Testes de propriedades: idempotência e preservação de bytes em no-op | Concluído · CI |
| E-094 | P1 | Testes adversariais com SVG/CSS/XML e ZIP fuzzing recorrente | Concluído · CI |
| E-095 | P2 | Cobertura de testes e thresholds por módulo crítico | Pendente |
| E-096 | P2 | Testes de performance/memória com limites documentados | Parcial |
| E-097 | P2 | Versionamento das decisões, changelog e matriz de suporte | Concluído · CI |
| E-098 | P2 | Revisar regras de proteção da dev e política de branch/tag | Parcial |
| E-099 | P2 | Análise periódica de dependências e licenças além do npm audit | Parcial |

## Commits desta execução

1. `aa4fcc4`: caminhos ZIP, MIME, NCX e testes.
2. `f3e9c7a`: fluxos de reparo, segurança, CI na dev e releases.
3. `22519fe`: sanitização de órfãos, binários suspeitos e auditoria de preservação.
4. `5688b56` / `7791273`: compatibilidade de fixtures jsdom e lint.
5. `0825c06` / `f943102`: idioma não inferido, spine, NCX vazio e capa; lint.
6. `50a9336`: âncoras, TOC vazio, concorrência e download.

Os commits intermediários que falharam na CI foram corrigidos por commits subsequentes; o HEAD validado em Node 20/22 era `50a9336` antes de registrar esta documentação.

## Critérios para a próxima execução

Priorizar os P0/P1 ainda pendentes, criando fixtures mínimas para cada defeito, e manter a contagem somente após obter evidência de teste. A auditoria final incluirá EPUBCheck, segurança adversarial, testes de browser/leitor e fidelidade editorial. Os 99 itens são um inventário aberto: novas descobertas devem ser acrescentadas explicitamente, e não ocultadas para manter o total fixo.

## Execução 2: correções e novos testes

**CI:** `eaaa258`, última mudança funcional/documental verificada em Node 20, Node 22
e EPUBCheck oficial 5.4.0. Os commits intermediários que falharam durante criação
da nova fixture foram corrigidos por `3e46e02`, confirmado como sucesso.

| Commit | Entrega |
| --- | --- |
| `d07f27b` | Gate de erros e avisos novos, conteúdo ativo residual e preservação da ordem |
| `6e89b31` | Recursos HTTP/HTTPS legítimos preservados no manifest |
| `4d5e39f` | Marcador de imagem ausente depende de opção específica |
| `b9c2067` | Correção granular de CSS, fallback e fontes embutidas |
| `97d328f` / `3e46e02` | EPUBCheck oficial no CI e fixture inválida/reparada |
| `0c0add7` | IDs ambíguos, ciclos de fallback e Media Overlays |
| `927ae06` | Sumário novo prefere headings editoriais reais sem inventar idioma |
| `05f0dbd` | Ações não aplicadas aparecem no relatório |
| `eaaa258` | Idempotência e documentação de segurança, limitações e suporte |

### Métricas da execução

- **Base:** 16 concluídos, 13 parciais, 70 pendentes
- **Atual:** 23 concluídos, 27 parciais, 49 pendentes
- **50/99 itens avançados** ao todo, com graus diferentes de cobertura
- **76/99 itens ainda não concluídos**, correspondentes a 27 parciais e 49 pendentes
- Progressos só contam como concluídos quando o critério testado passou no CI;
  a classificação não equivale a cobertura universal ou a homologação de leitores reais

### Próximas prioridades

1. E-052, E-064, E-065: sanitização conservadora, comprovação de preservação
   textual e referências editoriais no before/after.
2. E-021 a E-030 e E-053 a E-057: corpus ZIP, Unicode, encoding e sanitização
   adversarial com fuzzing e medição de falsos positivos.
3. E-038 a E-050: aprofundar regras EPUB 2/3, fallback, fragmentos, nav, SMIL,
   layout fixo, capas e acessibilidade.
4. E-089 a E-096: testes de navegadores, leitores, regressões diferenciais e
   performance; não declarar suporte a leitores que ainda não foram testados.

A `prod` **não foi alterada**. O próximo incremento deve ocorrer na `dev`.

## Execução 3: proteção editorial, ZIP Unicode, fontes e relatórios verificáveis

**Base:** 23 concluídos, 27 parciais, 49 pendentes.
**Atual:** **25 concluídos, 37 parciais, 37 pendentes**.

Há **62/99 itens com avanço** e **74/99 ainda não inteiramente concluídos**.
A contagem de parciais é conservadora: uma assinatura de imagem não comprova
decodificação de pixels; rejeição CP437 não é conversão de nomes; documentação
e diagnóstico não equivalem a suporte pleno.

| Commit | Avanço |
| --- | --- |
| `80bf939` | E-067 E-072 E-061: assinaturas/dimensões de imagens, alt, score heurístico |
| `6535a72` | E-064 E-065: bloqueio de perda de texto editorial |
| `e835565` | E-021 E-024 E-063: UTF-8/CP437 ambíguos, fuzzer ZIP determinístico |
| `a7a59fb` | E-052 E-077 E-079: cópia parcial nunca anunciada como pronta |
| `193dd6a` | E-053 E-057: imagens raster data: permitidas; HTML/SVG data: bloqueados |
| `4ef1761` | E-022 E-023 E-027: nomes NFC/NFD, ?/#/%, URI vs ZIP |
| `3d28bd6` | E-046: ofuscação oficial IDPF distinta de DRM |
| `e511599` | E-084: versão, opções atuais e SHA-256 no TXT/JSON |

### Pontos que permanecem apenas parciais

- **E-052:** modo conservador pode preservar conteúdo ativo; a UI agora classifica
  a saída como *cópia parcial*, mas não cobre todos os esquemas e contextos.
- **E-064/E-065:** bloqueio de perda de palavras e de capítulos implementado,
  mas ainda falta análise ampla de estrutura de notas, links, estilos e renderização.
- **E-067:** identificação de assinaturas e dimensões básicas, sem decodificar
  pixels nem comparar aparência em leitores.
- **E-021:** entradas com nome não UTF-8 sem decodificação segura são recusadas;
  não há conversor CP437 automático.
- **E-084:** hash do arquivo carregado no momento da emissão, que pode diferir
  do arquivo inicial após troca de capa. Opções registradas são atuais, não
  necessariamente as efetivamente usadas no reparo.
- **E-046:** apenas algoritmo IDPF reconhecido como ofuscação de fontes oficial.
  Outros algoritmos continuam com aviso conservador.

### Próxima execução sugerida

1. E-052/E-053/E-054/E-055: segurança adversarial com formatos ativos, SVG, CSS e modo conservador.
2. E-064/E-065/E-071/E-073: metadados de capítulos, IDs, links, diffs e preservação visual.
3. E-025/E-026/E-028/E-030: corpus ZIP adversarial, ZIP64 e multipartes com limites.
4. E-036/E-038/E-040/E-042/E-043/E-044: EPUB 2/3, OPF e navegação editorial.
5. E-089/E-090/E-091: testes de navegadores e leitores, expandindo corpus EPUBCheck.

**CI:** Node.js 20/22 e EPUBCheck 5.4.0 aprovaram o último commit funcional.
`prod` foi preservada; nenhum merge ou release foi disparado.

## Execução 4: XML/EPUB 2-3, ZIP íntegro, navegação e preservação

**Base:** 25 concluídos, 37 parciais, 37 pendentes.
**Atual:** **26 concluídos, 50 parciais, 23 pendentes**.

- **76/99 itens tiveram algum avanço**.
- **73/99 ainda não são integralmente concluídos**: 50 parciais e 23 pendentes.
- Isso mede itens com evidência de implementação/CI, **não uma homologação de segurança, fidelidade
  editorial ou suporte a todos os leitores**.
- A `prod` permaneceu inalterada, sem merge ou nova release.

### Escopo efetivamente desenvolvido

| Commits | Alterações verificadas |
| --- | --- |
| `aac9e82`, `efaff74` | E-056: DTDs legadas NCX/XHTML admitidas de forma estrita; entidades/DOCTYPE arbitrários e XInclude recusados |
| `d7aa71d`, `da55855` | E-038/E-040/E-072: duplicação e estrutura semântica de toc/page-list/landmarks; testes com listas/roles |
| `0680f83`, `7a171d4` | E-042/E-043/E-044: unique-identifier, dcterms:modified, refines, nav/cover-image, linear e direção RTL; fixture TypeScript corrigida |
| `320c7ec`, `017392a` | E-065/E-071: bloqueio de remoção de IDs, remissões e reordenação editorial, com regressões |
| `6faa6ba`, `9a24c08` | E-051/E-053/E-055: URL e handlers avaliados após parse DOM e decodificação de entidades |
| `3079066` | E-078: confirmação explícita de transformações destrutivas antes de gerar nova cópia |
| `9a3a821` a `85efded` | E-026/E-030: bloquear duplicação e sobreposição física de registros ZIP, sem descartar entradas silenciosamente |
| `6846a30` | E-029: escolha de rootfile OPF válido em multiple-renditions, sem excluir alternativas |
| `c18b488`, `f547834` | E-084: hash da origem original e snapshot de opções realmente usadas, inclusive após troca de capa |
| `8fe4d94` | E-091/E-092: EPUBCheck 5.4.0 verifica fixtures sintéticas antes/depois de EPUB 2 e EPUB 3 |
| `4dc897e`, `92697dc` | E-051: JS órfão diagnosticado sem inclusão automática nem classificação falsa de malware |
| `c090a61`, `e0e4492` | E-016/E-054: neutralização granular de expression/behavior CSS com regressões |
| `f436601` | E-099: relatório informativo de licenças de dependências no GitHub Actions, além do npm audit |

### Precauções e limitações

- E-052, E-055 e E-056 ainda não equivalem a cobertura de **todas** as construções
  possíveis de XML/XHTML/SVG/CSS. Modos conservadores continuam preservando conteúdo ativo
  e exigindo revisão humana em caso de detecção.
- E-026/E-030 ainda exigem corpus mais amplo, compatibilidade de data descriptors,
  ZIP64 e entradas vazias, testes adversariais e medição de falsos positivos.
- E-065 ainda precisa comparar semântica, apresentação visual e complexidade de
  fixed-layout, links, páginas com notas e recursos media overlay.
- E-084 concluído no escopo do inventário: SHA-256 do **EPUB originalmente carregado**
  e snapshot das opções aplicadas agora são preservados em memória. Não existe garantia
  criptográfica de autenticidade externa, assinatura digital nem armazenamento permanente.
- E-091 ampliado para EPUB 2 e 3, mas ainda parcial por faltar corpus amplo e diferentes
  perfis de conformidade e leitores reais.
- E-099 ainda parcial: licenças de pacotes opcionais não instalados e obrigações de
  licenças recíprocas exigem revisão adicional; o relatório não faz juízo jurídico.
- E-089, E-090 e E-096 seguem dependentes de testes em navegadores/dispositivos reais
  e análise de desempenho/memória com condições controladas.

### Prioridades recomendadas para a execução 5

1. E-025, E-028, E-031 e E-034: ZIP edge cases, data descriptors, ZIP64, limites/memória.
2. E-047, E-048 e E-050: SMIL/media overlays, fixed layout, capas e referências.
3. E-052, E-054, E-055 e E-063: corpus de segurança adversarial SVG/CSS/XML com ReDoS.
4. E-073, E-076, E-089 e E-090: diffs editoriais visuais e matriz de leitores/browsers.
5. E-095, E-096 e E-098: cobertura/limites de performance, proteção de branches
   e pré-condições de release.

## Execução 5: fechamento de ZIP, layout fixo e preservação editorial

**Base:** 26 concluídos, 50 parciais, 23 pendentes.
**Atual:** **29 concluídos, 52 parciais, 18 pendentes**.

- **81/99 itens receberam algum avanço** (inclui itens parciais).
- **70/99 ainda não estão integralmente concluídos**: 52 parciais e 18 pendentes.
- **3 itens encerrados por critério verificável:** E-028 (rejeição explícita ZIP64/multipartes/criptografia), E-034 (tamanho declarado versus fluxo real ZIP), E-048 (metadados de layout fixo, viewport XHTML, SVG viewBox e overrides por itemref).
- **2 itens passaram de pendentes a parciais:** E-025 (extra fields, ZIP64, data descriptors e proteção de offset) e E-047 (validação não destrutiva de SMIL, clipes de áudio, fragmentos e sincronização temporal).
- **P0/P1 existentes reforçados, sem conclusão prematura:** E-024, E-052, E-064, E-065, E-071, E-077. Regressões adicionais conferem a identidade extraída via JSZip, conservam links/âncoras e rejeitam fusão silenciosa de parágrafos.

### Evidência de commits e CI

| Commit | Entrega |
| --- | --- |
| `aad6a4c` | E-025/E-028: validar data descriptors, campos Unicode extras e formatos ZIP recusados com erro específico |
| `bce712a`, `afb2896` | E-024/E-034: comparar tamanho descompactado e CRC real; conferir identidade de entradas no diretório central versus JSZip |
| `af89edf` | E-047: nova inspeção de media overlays SMIL sem reescrever áudio nem texto sincronizado |
| `6894de6`, `d34e0f6`, `f401258` | E-064/E-065/E-071: preservar parágrafos, headings, âncoras legadas e propriedade linear dos capítulos; manter regressões antigas |
| `a0560e2` | E-048: validar viewport/layout fixo e documentos SVG no spine |
| `e27c017` | E-052/E-077: classificar a cópia pelo relatório final, não por alertas do arquivo original |
| `dab0ab9`, `467a1c9` | Corrigir sintaxe dos testes TypeScript para manter CI verde |

**CI verificada antes desta atualização documental:** [run 42070073476](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42070073476), com aprovação de Node.js 20, Node.js 22 e EPUBCheck 5.4.0. O commit somente documental subsequente requer sua própria confirmação de CI.

### Restrições ainda abertas

- E-025: corpus de extremos, combinações legais de extra fields e tamanhos/offsets de 64 bits ainda precisa ampliar.
- E-047: validar ainda SMIL/áudio/vídeo em leitores reais, múltiplos perfis e sincronização temporal de mídia real.
- E-048 está concluído no escopo de **diagnóstico técnico de fixed layout**; **não** equivale a homologação visual de páginas fixas em leitores. E-076 continua pendente.
- E-064/E-065: preservar apresentação visual, notas complexas e comparar EPUBs reais ainda precisa de homologação. Nenhum reparo autoriza alteração editorial silenciosa.
- Links/fontes HTTP e HTTPS legítimos continuam permitidos; o aplicativo não é um antivírus e não oferece garantia universal contra malware.
- `prod` permanece na v2.2.0, sem merge nem release. O PR rascunho #30 foi criado somente para disparar testes, não para publicação.

### Próxima prioridade de consolidação

1. Encerrar os **5 P0 parciais** com testes adversariais e preservação provada (E-051, E-052, E-064, E-065, E-086).
2. Consolidar os P1 de segurança ZIP/XML/CSS/SVG e conformidade EPUB; medir casos legítimos para evitar falsos positivos.
3. Homologar leitores reais, navegadores, memória e desempenho antes de elevar confiança da versão.

## Execução 6: consolidação de 20 critérios com CI

**Base:** 29 concluídos, 52 parciais, 18 pendentes.
**Situação atual:** **49 concluídos, 37 parciais, 13 pendentes**.

- **86/99 itens receberam algum avanço** (49 concluídos e 37 parciais).
- **50/99 ainda não estão totalmente concluídos** (37 parciais e 13 pendentes).
- **20 itens passaram a concluídos no escopo automatizado definido**: E-011, E-013, E-024, E-037, E-040, E-050, E-051, E-058, E-061, E-064, E-065, E-070, E-073, E-077, E-078, E-079, E-081, E-083, E-093, E-097.
- **E-049** passou de pendente a parcial: estruturas MathML/ruby e direção RTL agora são preservadas por auditoria, mas escrita vertical, idiomas mistos e prova visual continuam sem homologação.

### Evidência técnica e decisões

| Área | Fechamentos e evidências |
| --- | --- |
| P0: inventário/segurança (E-051) | `26a522e` e `30a8d55`/fix `8af4e0d`: JS declarado/órfão, assinatura binária e XHTML/CSS/SVG ativo fora do manifest; sem excluir recursos legítimos automaticamente |
| P0: fidelidade textual (E-064, E-065) | `8aba69f`/fix `20c499f`: capítulos e `linear`, blocos, âncoras e destinos NCX, MathML/ruby/RTL. Não é verificação visual de leitores |
| ZIP (E-024) | Exercícios com diretório central, JSZip, CRC, payloads alterados e identidade física, sobre a base segura da execução 5 |
| Navegação/manifest (E-011, E-013, E-037, E-040) | `e8d0758`, `b721601`, `9e003ab` e `48b5664`/fix `76d1d4e`: títulos editoriais, URLs com fragmentos Unicode, page-list/landmarks/guide, e recusa de IDs duplicados ambíguos sem quebrar referências |
| Capa e arquivos (E-050, E-058) | `26a522e`, `766ac11`: guide/landmark/meta/cover-image e identificação de assinaturas binárias de anexos suspeitos |
| Diagnóstico (E-061, E-070) | `766ac11`, `16a967d`: CSS repetido/contraditório apenas informativo e scores separados, sem alegação de antivírus |
| Relatório e consentimento (E-073, E-077, E-078, E-079) | `5a59573`, `16a967d`, `9f920ec`, `7628d9e`: diferenças por linha com limite, estados claros, confirmação de mudanças e tarefas puladas por item |
| Concorrência/acessibilidade/testes (E-081, E-083, E-093) | `4276d20`, `401a3b5`, `1d9cc31`: snapshot de opções, bloqueio de ações concorrentes, retenção de foco e testes de no-op/idempotência |
| Versionamento (E-097) | `a2c837d`: `CHANGELOG.md`, decisões e matriz de compatibilidade atualizados sem publicar release |

**CI verificada para todo o conjunto de código:** [run 42077405185](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42077405185), com Node.js 20/22, lint, typecheck, testes, build e EPUBCheck 5.4.0 aprovados. O commit documental desta auditoria será validado separadamente.

### Priorização para a próxima execução

1. **P0 ainda parciais: E-052 e E-086**. Precisam de cobertura adversarial mais ampla e prova de sanitização em todos os modos, inclusive conservador. A presença de risco residual continua sendo explicitada como revisão manual, não arquivo livre de ameaças.
2. E-025/E-026/E-030/E-031/E-054/E-055/E-056: corpus maior e picos reais de memória, XML/SVG/CSS e ZIPs extremos.
3. E-047/E-049/E-076/E-089/E-090: sincronização de áudio/vídeo, composição visual, escrita complexa e testes em leitores/browsers reais.
4. E-095/E-096/E-098: instrumentação de cobertura/performance e políticas administrativas efetivas de proteção de branches.

**Restrições importantes:** “Concluído · CI” denota aceitação no escopo definido e testes atuais, não imunidade a malware ou compatibilidade universal. O diagnóstico de JavaScript e de HTTP/HTTPS preserva casos legítimos e não prova a ausência de código hostil. E-013 está encerrado pela decisão segura de **não renomear IDs ambíguos automaticamente**, exigindo revisão manual para corrigir a obra. A branch `prod` e a release `v2.2.0` seguem intactas, sem merge.

## Execução 7: propriedades EPUB 3, dados originais e testes adversariais

**Antes:** 49 concluídos, 37 parciais, 13 pendentes.  
**Agora:** **61 concluídos, 29 parciais, 9 pendentes**.

- **12 critérios encerrados no escopo automatizado:** E-016, E-023, E-025, E-030, E-033, E-038, E-042, E-056, E-057, E-086, E-091, E-094.
- **3 pendentes avançaram a parciais:** E-031, E-069, E-096.
- **90/99 tiveram avanço de implementação/testes**; **38/99 não estão concluídos**.
- **P0:** 11 concluídos, 1 parcial(is), 0 pendentes.
- A classificação **não é uma porcentagem de horas trabalhadas**: itens têm custos e riscos diferentes.

### Entregas verificadas

| Grupo | Evidência |
| --- | --- |
| Conteúdo ativo conservador (E-052, permanece parcial) | `dc747c7` e correções `b028045`/`9f5ad56`: saneamento opt-in de XHTML/SVG/CSS, preservação de fontes externas e binários, sem afirmar ausência de payload órfão |
| CSS adversarial e dados passivos (E-016, E-057) | `b5dc1fe`: detecção de escapes/comentários e bloqueio fail-closed sem apagar `style` inteiro; testes de `data:image` raster, fontes e esquemas executáveis |
| Nomes e estrutura ZIP (E-023, E-025, E-030) | `c1fa82c` e `6e4d3fa`: colisões Unicode/caixa não tratadas como malware, data descriptors, mimetype físico, extras e entradas vazias |
| Memória (E-031, E-096, permanecem parciais) | `1c3ff42`, `6cb369e`, `7f7ce50`: inflate com buffer único, orçamento de 30s e +320 MiB RSS amostrado para EPUB sintético de 2 MiB; não representa limite real de dispositivos |
| Encoding (E-033) | `8a36f0a`, `05ccc00`: recusar UTF-16 e bytes não UTF-8 antes de reescrever; preservar declarações XML UTF-8 em OPF, NCX e troca de capa |
| Navegação (E-038) | `fbc76ae`, fix `2aee258`: listas `toc` aninhadas e labels span/a com estrutura correta, sem exigir entrada para cada arquivo de leitura |
| Propriedades do manifest (E-042) | `3502f8f`, `5bee2c0`: inspecionar `scripted`, `mathml`, `svg`, `switch`, `remote-resources` segundo [EPUB 3.3 W3C](https://www.w3.org/TR/epub-33/); sincronizar metadados após saneamento e preservar links HTTP/HTTPS legítimos |
| XML e entidades (E-056) | `86fe8a9`: DTDs padronizadas, XInclude, entidades e referências externas, sem falso positivo em CDATA e comentários |
| Corpus/fuzz (E-086, E-094) | `54b4a6c`, `5d19ad9`, `ac09f6f`: 18 cenários EPUB sintéticos e 384 mutações determinísticas de XML/OPF/SVG/CSS/ZIP em toda execução da CI |
| Validação oficial diferencial (E-091) | `57fd2a7`, `d2e42b9`: cinco pares de EPUB 2/3 com falha original e saída reparada; EPUBCheck pode aceitar mimetype comprimido, divergência documentada em vez de inventar reprovação |
| OCR e downloads (E-069, E-082, ainda parciais) | `42b1a8b`, `4e3b808`: diagnósticos informativos de artefatos de OCR e limpeza de ObjectURL no pagehide, mantendo janela de compatibilidade Safari |
| Dependências (E-099, permanece parcial) | `df9a9c2`: auditoria de integridade, lockfile, licenças e workflow semanal preparado. **Cron ainda inativo:** GitHub só o agenda a partir da branch padrão `prod` |

**Evidência de CI para todo o código desta execução:** [GitHub Actions / 42090373958](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42090373958), testes, lint, TypeScript, build em Node 20 e Node 22, EPUBCheck 5.4.0 aprovados.

### Pendências e limites após execução 7

1. **P0 E-052:** concluir prova adversarial abrangente dos recursos ativos, inclusive órfãos; não limpar nem excluir silenciosamente material do autor.
2. **P1 E-031, E-047, E-069, E-080, E-082, E-089 e E-090:** casos grandes e memória real, sincronização audiovisual, OCR, fila/cancelamento, Safari/iOS e leitores externos.
3. **P2 E-049, E-096 e E-099:** escrita vertical/idiomas mistos, benchmark maior e workflow semanal realmente ativo somente após promoção aprovada para a branch padrão.

**Produção:** nenhum merge, nenhuma tag, nenhuma release. A `prod` mantém a v2.2.0.

## Execução 8: fechamento dos P0 e proteção de múltiplas renditions

**Estado anterior:** 61 concluídos, 29 parciais, 9 pendentes.
**Agora:** **67 concluídos, 24 parciais, 8 pendentes.** Todos os **12 P0 concluídos nos critérios automatizados definidos**; isso não equivale a certificação de segurança nem ausência de malware.

- **Concluídos nesta rodada:** E-026, E-027, E-029, E-039, E-052, E-053.
- **De pendente a parcial:** E-062.
- **91/99 itens com avanço comprovado** (67 concluídos, 24 parciais).
- **32/99 ainda sem encerramento integral** (24 parciais, 8 pendentes).

### Evidências de código e testes

| Escopo | Alterações e verificação |
| --- | --- |
| E-052 (P0): sanitização/alerta | `d1b5ae6`, `37cca56`, `2848155`, `19d6862`, `180ebba`: scripts, embeds, eventos, SVG/CSS e órfãos inspecionados por DOM; reparo normal/conservador/opt-out/otimização cobertos por regressões; JS declarado legítimo é preservado mas **exige revisão manual**, não tem falso parecer de segurança |
| E-053 (P1): URLs adversariais | `d1b5ae6`, `2848155`: decodificação de entidades, sinais executáveis, srcset e URL de atributo real; comentários e código editorial escapado não contam como referências |
| E-027 (P1): nomes ZIP | `089cde3`: round-trip físico e lógico de `#`, `?`, `%`, espaço, caracteres Unicode e formas NFC/NFD |
| E-039 (P1): fragmentos NAV/NCX | `9379ecf`: nomes percent-encoded, Unicode, âncora legada, page-list e destino não encontrado, sem exigir índice item a item |
| E-029 (P1): várias renditions | `b4a2365`, `9e53727`, `1bc3d26`, `1109315`: **corrigida perda real de rootfiles** causada por reconstrução indevida de `container.xml`; não adotar arquivos de outra edição; compare o container e OPFs secundários byte a byte |
| E-026 (P1): ZIP ambíguo | `9330a4d`, `a4c301e`: duplicação/sobreposição já cobertas, polyglots com cabeçalho executável/HTML e trailer incompatível rejeitados, comentários ZIP verdadeiros preservados |
| E-062 (P2, parcial) | `410b15e`, `55d8a21`: asserções de CSP/Netlify em testes; falta validação real das respostas HTTP e comportamento de navegadores/WebKit |

**CI validada:** [GitHub Actions / 42093937447](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42093937447): lint, TypeScript, testes e build em Node.js 20 e 22; EPUBCheck 5.4.0 concluídos com sucesso.

### Restrições de confiança e ações prioritárias

1. O gate P0 E-052 considera um resultado **parcial com revisão manual** quando JavaScript legítimo declarado, payload órfão ou qualquer conteúdo ativo residual permanece, inclusive por opt-out. Não remove arbitrariamente arquivos JS legítimos de EPUB 3, nem afirma ausência de malware.
2. E-029 trata **uma rendition ativa por análise**. Outras edições são preservadas integralmente e exigem inspeção própria. Múltiplos rootfiles não são erro de segurança por si sós.
3. E-032/E-080: execução via Worker, progresso e cancelamento. A CSP atual contém `worker-src 'none'` e precisará mudar com testes reais antes dessa evolução.
4. E-031/E-096: benchmark sintético não comprova consumo de memória em livros grandes ou dispositivos modestos.
5. E-047/E-049/E-089/E-090: sincronização audiovisual, escrita complexa e leitores/browsers reais seguem sem homologação universal.
6. E-062: configurações Netlify testadas estaticamente, não demonstram os headers servidos em produção.

**Branch `prod` intacta na v2.2.0; nenhuma release nem merge efetuados.**

## Execução 9: fallbacks, semântica OPF, SMIL e descompactação única

**Antes:** 67 concluídos, 24 parciais, 8 pendentes.  
**Atual:** **72 concluídos, 19 parciais, 8 pendentes**.

**Cinco critérios fechados nesta rodada:** E-041, E-043, E-044, E-045, E-047.
**Critério com avanço adicional, ainda parcial:** E-031 (memória real em browsers). **E-047 foi encerrado no critério automatizado de não danificar a sincronização áudio/texto**, após incluir proteção de preservação; testes de reprodução em leitores físicos ainda não foram realizados.
**91/99 possuem avanço; 27/99 não estão totalmente concluídos.**

| Item | Evidências implementadas |
| --- | --- |
| E-041 | `b207d60`, `6afbaa1`, `2cc4493`, `4687dab`, `c3b2bbb`: fallback IDREF/cadeia, ciclo e destino core, material estrangeiro no spine, imagem HEIC incorporada no XHTML, XHTML remoto inválido como fallback de leitura; evita fabricar capítulos |
| E-043 | `aee7775`, `24d162b`, `eadf614`: unique-identifier/DC, dcterms:modified UTC exato (sem aceitar datas impossíveis), prefixos registrados e referenciados, refs inválidas sem alterar metadados |
| E-044 | `b207d60`, `de69091`, `273af4e`: direções RTL/LTR/default, linear=yes/no, páginas auxiliares, fallback XHTML/SVG para documentos estrangeiros do spine |
| E-045 | `0f57b9b`, `c6fe0fa`, `c3532b0`: políticas EPUB 2/3 para recursos remotos por MIME; áudio, vídeo, fontes HTTPS mantidos; HTTP é informação de transporte, não malware; property remote-resources exige recurso incorporado, não hyperlink |
| E-047 | `f0e1bf1`, `09f7605`, `4d7b5ab`: SMIL IDs únicos, namespace real, MIME e links dos alvos, tempos de clipes; auditoria impede modificar bytes SMIL ou desfazer media-overlay ao reparar |
| E-031 (parcial) | `3b1544f`: a inspeção inicial e o reparo reutilizam a mesma descompactação, eliminando segunda carga completa; tests/singleLoadRepair99.test.ts compara os relatórios. **Picos reais em navegadores ainda não medidos.** |

### Validação, riscos e limites

- **Gates:** Node.js 20 e 22 (TypeScript, ESLint, testes, build), EPUBCheck 5.4.0; consultar o último run na [CI da dev](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions?query=branch%3Adev). Nenhum estado foi promovido para produção.
- **P0:** 12 concluídos, 0 parciais, 0 pendentes. Fechamento **no escopo automatizado**, não garantia absoluta.
- **P1:** 52 concluídos, 14 parciais, 2 pendentes.
- **P2:** 8 concluídos, 5 parciais, 6 pendentes.
- **E-047:** preserve bytes e vínculos SMIL; **não** afirma playback ou sincronia perfeita em Kindle Previewer, Apple Books ou outros leitores reais.
- **E-045:** recursos HTTPS legítimos não são classificados como malware; manifest remoto inválido é conformidade e requer revisão, não remoção automática.
- **E-031:** nenhuma alegação de consumo máximo de RAM em dispositivo móvel; apenas regressões e redução estrutural de cópias.
- Próximas frentes: **E-032/E-080** Worker/fila/cancelamento, **E-031/E-096** medidas em dispositivos, **E-089/E-090** leitores e browsers reais, **E-059** verificação AV externa opt-in.

**Preservação de produção:** `prod` permanece v2.2.0, sem merge, tag ou release desta auditoria.

## Execução 10: Worker de ZIP, cancelamento, conteúdo editorial e pós-reparo

**Antes:** 72 concluídos, 19 parciais, 8 pendentes.  
**Agora:** **75 concluídos, 21 parciais, 3 pendentes**.

- **Concluídos no critério automatizado:** E-071, E-074, E-092.
- **Avançaram de pendentes a parciais:** E-032, E-075, E-080, E-098.
- **Com algum avanço:** 96/99 itens. **Ainda sem conclusão integral:** 24/99 (21 parciais e 3 pendentes).
- **Distribuição:** P0 12/0/0, P1 54/13/1, P2 9/8/2 (concluído/parcial/pendente).

### Entregas e evidências

| Item | Implementação e verificação |
| --- | --- |
| E-032 (parcial) | `3370e6d`, `83b7973`: Worker de mesma origem para extrair ZIP/CRC com progresso por entrada, transferência dos buffers extraídos, fallback sem Worker; não moveu o parser DOM nem o reempacotamento para a thread |
| E-080 (parcial) | `83b7973`, `ad1a375`: estado de processamento, botão Cancelar, `AbortController` terminando Worker, descarte de respostas tardias, checkpoints nos reparos/capa, progresso de recompactação por porcentagem real JSZip. Não há fila persistente nem interrupção imediata de código DOM síncrono |
| E-074 | `2ce6e0f`, `634777d`: guarda editorial de tags de ênfase/negrito, `br`, `pre`, `code`, classes e CSS inline não perigoso; teste evita perda de formatação mesmo quando texto continua igual |
| E-071 | `83340ae`: validar noteref, footnotes/endnotes, backlinks explícitos e alvos XHTML, sem inventar IDs ou tornar backlink obrigatório |
| E-072 (continua parcial) | `a1aae82`: avisos de `aria-labelledby` quebrado e SVG sem nome acessível, com exceção para SVG decorativo e `alt=""` intencional |
| E-075 (parcial) | `1cdb5e5`, `7f6805b`, `b8972e1`: inventário não destrutivo EXIF/XMP/Photoshop em JPEG/PNG/WebP; **não remove metadados, não altera perfis ICC nem afirma limpeza de privacidade** |
| E-092 | `7056de4`: reabrir saída ZIP, comparar relatório independente e testar rejeição de novos links/fragmentos e imagens quebrados, mantendo HTTPS legítimo |
| E-098 (parcial) | `fd43310`: consulta de ruleset ativo de `prod` e documentação operacional. A proteção legada específica retorna 403; `dev` não tem ruleset visível; nenhum bloqueio de push ou tag foi criado |
| CSP e documentação | `3370e6d`, `fd43310`: `worker-src 'self'` no Netlify, sem `blob:` para scripts; documentação de limitações e políticas em `docs/WORKER_PROCESSING.md` e `docs/BRANCH_POLICY.md` |

### Evidência e limitações

CI final anterior à atualização documental: [run 42102087907](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42102087907), com qualidade Node 20/22 e EPUBCheck 5.4.0 aprovados.

1. O Worker mantém a UI responsiva na extração do ZIP, mas o parse XHTML/DOM ainda ocupa a thread principal. O cancelamento durante compressão ou DOM síncrono pode esperar até o próximo checkpoint; o EPUB incompleto não é entregue.
2. A transferência Worker reduz cópia dos buffers de saída, mas a entrada é temporariamente clonada para o Worker: **não afirmar redução do pico total de memória sem medição em browser real**.
3. Nenhum perfil de cor, EXIF, XMP, Photoshop ou metadado autoral é apagado.
4. `E-076`, `E-089` e `E-095` permanecem pendentes: homologação visual em leitores, testes reais nos browsers e thresholds instrumentados de cobertura por módulo.
5. Todos os 12 P0 permanecem concluídos **somente no escopo de testes e critérios documentados**, não em detecção antivírus universal.

**Produção:** `prod` preservada na `v2.2.0`, sem merge, release, mudança de regras ou tags.
