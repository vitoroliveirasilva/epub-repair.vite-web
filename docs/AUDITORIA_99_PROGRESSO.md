# Andamento da auditoria de 99 itens

**Última atualização:** 05/11/2026 (execução 3, última CI validada) · **Branch de trabalho:** `dev` · **Produção:** `prod` preservada na v2.2.0.

Este arquivo acompanha o [inventário integral](./AUDITORIA_99_BASE.md). O progresso aqui indica escopo entregue com CI ou avançado parcialmente, **não uma certificação global de segurança ou compatibilidade**.

| Situação | Itens |
| --- | ---: |
| Concluídos no escopo definido, com CI Node 20/22 aprovada | **25** |
| Parcialmente tratados, com testes/validação adicionais necessários | **37** |
| Não iniciados ou ainda não evidenciados | **37** |
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
| E-011 | P1 | Gerador de nav e NCX usa IDs/nomes de arquivos como títulos de sumário | Parcial |
| E-012 | P1 | Gerador NCX pode emitir navPoint com src vazio quando não há documentos elegíveis | Concluído · CI |
| E-013 | P1 | Renomear IDs duplicados do manifest não atualiza todas as referências dependentes | Parcial |
| E-014 | P1 | URI remota legítima em item do manifest pode ser tratada como caminho local ausente | Concluído · CI |
| E-015 | P1 | CSS com url() inválida substituída por none pode produzir declaração inválida em @font-face | Concluído · CI |
| E-016 | P1 | CSS perigoso embutido pode causar remoção de todo o elemento style | Parcial |
| E-017 | P1 | Marcador de referência ausente substitui imagem, alterando texto/layout sem prévia | Concluído · CI |
| E-018 | P1 | O score de segurança pode ficar 100 mesmo quando há falha fatal ZIP_RESOURCE_LIMIT | Concluído · CI |
| E-019 | P1 | Troca de capa é disponibilizada sem gate equivalente sobre a validação final | Concluído · CI |
| E-020 | P2 | README exibe badge versão 2.0.0 embora package e release sejam 2.2.0 | Concluído · CI |
| E-021 | P1 | Nomes de entrada ZIP não UTF-8 e sinalização de encoding em flags | Parcial |
| E-022 | P1 | Caminhos com %23, %25, %2F, #, ?, Unicode NFC/NFD | Concluído · CI |
| E-023 | P1 | Colisões depois de decodificação, normalização ou diferença de caixa | Parcial |
| E-024 | P1 | Consistência entre nomes do diretório central e nomes vistos pelo JSZip | Parcial |
| E-025 | P1 | Extra fields Unicode, data descriptors, tamanhos e offsets extremos | Pendente |
| E-026 | P1 | Sobreposição de payload ZIP, entrada duplicada e polyglots | Pendente |
| E-027 | P1 | Arquivos e diretórios com nomes especiais ou caminhos relativos anômalos | Parcial |
| E-028 | P1 | EPUB multipartes/ZIP64/criptografia rejeitados com diagnóstico preciso | Pendente |
| E-029 | P1 | Manifest e container com múltiplos rootfiles/renditions | Pendente |
| E-030 | P1 | mimetype duplicado, diretórios primeiro, extras e arquivos de tamanho zero | Pendente |
| E-031 | P1 | Picos de memória ao carregar/decompactar/revalidar várias vezes | Pendente |
| E-032 | P2 | Progresso, cancelamento e execução em Worker para EPUBs grandes | Pendente |
| E-033 | P2 | Preservação de encoding/declaracão XML ao reescrever XHTML/OPF | Pendente |
| E-034 | P2 | Tamanhos declarados ZIP diferentes dos fluxos descompactados | Pendente |
| E-035 | P0 | EPUBCheck oficial integrado à validação de arquivos reparados no CI | Concluído · CI |
| E-036 | P1 | Matriz separada EPUB 2, EPUB 3.0/3.2/3.3 e EPUB 3.4 | Parcial |
| E-037 | P1 | Links internos com fragmento inexistente (#id) | Parcial |
| E-038 | P1 | Links de nav.xhtml e seus fragmentos, hierarquia toc e estrutura de lista | Parcial |
| E-039 | P1 | NAV/NCX com URLs escapadas, fragmentos, âncoras internas e caracteres especiais | Parcial |
| E-040 | P1 | Suporte a page-list, landmarks e guide sem destruí-los | Pendente |
| E-041 | P1 | Validação de fallback e ciclos de referência de recursos foreign | Parcial |
| E-042 | P1 | Validar propriedades required do manifest: nav, cover-image, scripted, remote-resources etc | Pendente |
| E-043 | P1 | Metadados package unique-identifier, dcterms:modified, prefix, refines e vínculos | Pendente |
| E-044 | P1 | Spine linear, page-progression-direction, documentos estrangeiros e fallbacks | Pendente |
| E-045 | P1 | Controle de arquivos remotos permitidos por tipo, propriedade e versão | Parcial |
| E-046 | P1 | Fontes obfuscadas/legalmente ofuscadas e META-INF/encryption.xml | Concluído · CI |
| E-047 | P1 | Media Overlays/SMIL, sincronização de áudio e vídeos, quando presentes | Pendente |
| E-048 | P1 | Metadados fixed-layout e documentos SVG no spine | Pendente |
| E-049 | P2 | MathML, ruby, RTL, escrita vertical e idiomas mistos | Pendente |
| E-050 | P2 | Declarações de imagem de capa em OPF/guide/nav/cover-image | Pendente |
| E-051 | P0 | Verificação dos arquivos JS/binários não mencionados no fluxo de sanitização | Parcial |
| E-052 | P0 | Sanitização de todo conteúdo ativo em cada modo de reparo, inclusive conservador | Parcial |
| E-053 | P1 | Atributos URL que usam entidades, controles, espaços e codificações alternativas | Parcial |
| E-054 | P1 | CSS url(), @import, escapes e comentários com sintaxe adversarial | Pendente |
| E-055 | P1 | SVG com URI/script/eventos/namespace e recursos incorporados | Pendente |
| E-056 | P1 | XML com DTD/XInclude/entidades externas e DOCTYPE incomum | Pendente |
| E-057 | P1 | data: image/font (passivo) versus data: HTML/SVG executável | Parcial |
| E-058 | P1 | Detectar MIME por assinatura para anexos suspeitos (sem executar arquivos) | Parcial |
| E-059 | P1 | Scan AV opcional fora do navegador, sem alegar antivírus integrado | Parcial |
| E-060 | P1 | Modelo de ameaças EPUB e checklist de privacidade de recursos externos | Concluído · CI |
| E-061 | P1 | Separar score de segurança de inspeção de conformidade e de integridade | Parcial |
| E-062 | P2 | Headers CSP/Netlify e comportamento de previews/blob/data em navegadores | Pendente |
| E-063 | P2 | Fuzzing determinístico de ZIP/XML/SVG/CSS/OPF e limites contra ReDoS | Parcial |
| E-064 | P0 | Comparar texto integral pré/pós e avisar alterações não previstas | Parcial |
| E-065 | P0 | Comparar ordem de leitura, capítulos, IDs e links antes/depois | Parcial |
| E-066 | P1 | Verificar integridade binária das imagens/fontes que não deveriam ser alteradas | Concluído · CI |
| E-067 | P1 | Validar imagens por dimensões, assinatura, decodificação e pixels quando alteradas | Parcial |
| E-068 | P1 | Consertos de headings, capítulos, títulos de navegação e sumários editoriais | Parcial |
| E-069 | P1 | Detectar OCR malformado, quebras artificiais, hifens, cabeçalhos e rodapés | Pendente |
| E-070 | P1 | Diagnóstico de CSS redundante/contraditório ou referências de estilos quebradas | Pendente |
| E-071 | P1 | Notas de rodapé, backlinks, endnotes, índices e remissões internas | Pendente |
| E-072 | P1 | Acessibilidade editorial: alt, lang, semântica, nav e leitura assistiva | Parcial |
| E-073 | P1 | Fluxo antes/depois com diffs de XHTML, CSS, OPF e NCX | Pendente |
| E-074 | P2 | Preservar tipografia, itálicos, travessões, espaçamento e estilos de diálogo | Pendente |
| E-075 | P2 | Tratamento opcional de EXIF/XMP/Photoshop/metadata de imagens | Pendente |
| E-076 | P2 | Checagem de apresentação em leitores reflowable/fixed layout, imagens e fontes | Pendente |
| E-077 | P1 | Estados explícitos: seguro para reparar, revisão manual, parcial, otimização, inválido | Parcial |
| E-078 | P1 | Prévia e confirmação de operações destrutivas antes de executar | Pendente |
| E-079 | P1 | Indicador de ações não aplicadas e pendências remanescentes por item | Parcial |
| E-080 | P1 | Fila e interrupção de tarefas grandes, feedback de processamento real | Pendente |
| E-081 | P1 | Trocar de arquivo/opções enquanto análise ainda está em execução | Parcial |
| E-082 | P1 | Download blob em Safari/iOS, liberação imediata de ObjectURL | Parcial |
| E-083 | P2 | Teclado, leitor de tela e foco após rerender completo | Pendente |
| E-084 | P2 | Exportar relatório técnico com prova de versão, opções e hash do original | Parcial |
| E-085 | P2 | Manual de limitações (correção técnica vs editorial vs antivírus vs EPUBCheck) | Concluído · CI |
| E-086 | P0 | Corpus de EPUBs sintéticos derivado dos defeitos reais observados nos chats | Parcial |
| E-087 | P1 | CI executa em push para prod e PR para prod, não em push para dev | Concluído · CI |
| E-088 | P1 | Workflow release manual aceita disparo sem condição de sucesso da CI | Concluído · CI |
| E-089 | P1 | Matriz de browsers Chromium/Firefox/WebKit e dispositivos móveis | Pendente |
| E-090 | P1 | Matriz de leitores: Kindle Previewer, Calibre e leitores EPUB 2/3 | Parcial |
| E-091 | P1 | Regressão diferencial: EPUBCheck original × reparado | Parcial |
| E-092 | P1 | Validação pós-reparo de conteúdo real e links, não só ZIP/OPF | Parcial |
| E-093 | P1 | Testes de propriedades: idempotência e preservação de bytes em no-op | Parcial |
| E-094 | P1 | Testes adversariais com SVG/CSS/XML e ZIP fuzzing recorrente | Pendente |
| E-095 | P2 | Cobertura de testes e thresholds por módulo crítico | Pendente |
| E-096 | P2 | Testes de performance/memória com limites documentados | Pendente |
| E-097 | P2 | Versionamento das decisões, changelog e matriz de suporte | Parcial |
| E-098 | P2 | Revisar regras de proteção da dev e política de branch/tag | Pendente |
| E-099 | P2 | Análise periódica de dependências e licenças além do npm audit | Pendente |

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
