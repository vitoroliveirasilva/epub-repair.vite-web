# Auditoria ampliada de lacunas do EPUB Repair

**Data:** 05/11/2026  •  **Repositório:** https://github.com/vitoroliveirasilva/epub-repair.vite-web  •  **Commit auditado:** `bc9a6e7e9578429d64637906d7d271203d7bd29c` (prod/dev)  •  **Versão:** 2.2.0

**Escopo e limitações:** inventário abrangente de anomalias determinadas por leitura estática, hipóteses para validação e capacidades futuras relevantes ao objetivo do reparador. Não é prova de que todo item é um defeito nem garantia de 100% de cobertura. O código foi lido pelo conector GitHub. Não foi alterado. A clonagem via terminal ficou indisponível por falha de DNS, portanto não foi possível executar nova bateria local, browsers ou EPUBCheck nesta auditoria. O histórico de chats foi recuperado por busca contextual, não por exportação literal integral de todas as conversas.

**Legenda:** `Confirmado` = comportamento encontrado diretamente na leitura do código, mas ainda deve ser reproduzido com teste; `Testar` = risco/hipótese a investigar antes de aprovar correção; `Evolução` = capacidade inexistente ou sem cobertura demonstrada, não necessariamente bug. **P0** = crítico para confiar no resultado; **P1** = importante; **P2** = melhoria/robustez.

**Princípios obrigatórios:** preservar links e fontes HTTP/HTTPS legítimos por padrão; não voltar a exigir uma entrada NCX para cada arquivo do spine; não modificar redação/tradução sem necessidade e aprovação; não incluir livros comerciais completos no repositório público; não declarar o EPUB livre de malware por ter apenas score alto.

## Fontes públicas de referência
- [Código e histórico GitHub do projeto](https://github.com/vitoroliveirasilva/epub-repair.vite-web)
- [EPUB 3.4, W3C Candidate Recommendation (2026)](https://www.w3.org/TR/epub-34/)
- [EPUB 3.3, W3C Recommendation](https://www.w3.org/TR/epub-33/)
- [EPUBCheck 5.4.0, verificador oficial](https://github.com/w3c/epubcheck/releases/tag/v5.4.0)

## 1. Comportamentos observáveis no código (corrigir ou confirmar por teste de regressão)

| ID | Prioridade | Tipo | Item | Onde investigar | Critério de aceitação |
|---|---|---|---|---|---|
| E-001 | P0 | Confirmado | Mensagem de “EPUB pronto” quando só restam erros/avisos não reparáveis | `src/app/actions.ts; src/ui/components/Controls.ts` | Distinguir pronto, pendência manual, inválido e reparável |
| E-002 | P0 | Confirmado | Destino inexistente no NCX é marcado reparável, mas o reparo não corrige o destino | `src/epub/validation/validateKindleCompatibility.ts; src/epub/repair/repairKindleCompatibility.ts` | Não prometer reparo automático sem ação implementada |
| E-003 | P0 | Confirmado | NCX declarado, ausente e removido do manifest pode ser recriado sem voltar ao manifest | `src/epub/repair/repairOpf.ts: repairManifest + ensureNavigationFiles` | Gerar NCX com item válido e spine toc em EPUB 2 |
| E-004 | P0 | Confirmado | Recurso órfão adicionado ao manifest não passa pela sanitização deste mesmo reparo | `src/epub/repair/repairOpf.ts; src/epub/repair/repairContentDocuments.ts` | Sanitizar todos os recursos efetivamente incluídos ou não incluí-los |
| E-005 | P0 | Confirmado | Decodificação e corte de #/? usados em nomes físicos de ZIP | `src/epub/utils/pathUtils.ts: normalizeInternalPath` | Preservar nomes ZIP; decodificar apenas referências URI |
| E-006 | P0 | Confirmado | Resultado final revalidado pode ser liberado mesmo com erros críticos ou regressões | `src/epub/repair/repairEpub.ts` | Impor gate de integridade/conformidade antes de sinalizar êxito |
| E-007 | P1 | Confirmado | Detecção de MIME por extensão pode reescrever MIME válido (ex.: fontes OpenType) | `src/epub/validation/validateOpf.ts; src/epub/repair/repairOpf.ts` | Permitir equivalências legítimas por perfil EPUB |
| E-008 | P1 | Confirmado | Idioma pt-BR usado sem comprovação quando metadado falta ou é inválido | `src/epub/repair/repairOpf.ts; src/epub/utils/kindleCompatibility.ts` | Não inventar idioma; pedir decisão ou marcar como desconhecido |
| E-009 | P1 | Confirmado | JPEG progressivo pode ser convertido no mesmo fluxo de reparo obrigatório | `src/epub/repair/repairEpub.ts; src/epub/repair/repairImages.ts` | Otimização opt-in isolada, preservação da imagem padrão |
| E-010 | P1 | Confirmado | Spine vazio é reconstruído seguindo a ordem do manifest, não a ordem editorial | `src/epub/repair/repairOpf.ts: repairSpine` | Reconstruir somente com ordem fundamentada; caso contrário revisão manual |
| E-011 | P1 | Confirmado | Gerador de nav e NCX usa IDs/nomes de arquivos como títulos de sumário | `src/epub/repair/repairNavigation.ts` | Extrair títulos verificados sem inserir páginas não editoriais |
| E-012 | P1 | Confirmado | Gerador NCX pode emitir navPoint com src vazio quando não há documentos elegíveis | `src/epub/repair/repairNavigation.ts` | Não emitir entrada de navegação sem destino válido |
| E-013 | P1 | Confirmado | Renomear IDs duplicados do manifest não atualiza todas as referências dependentes | `src/epub/repair/repairOpf.ts: repairManifest; repairSpine` | Preservar/atualizar idref, fallback, media-overlay e outras referências |
| E-014 | P1 | Confirmado | URI remota legítima em item do manifest pode ser tratada como caminho local ausente | `src/epub/validation/opfParser.ts; src/epub/repair/repairOpf.ts` | Compatibilizar remote-resources EPUB 3 com política explícita de preservação |
| E-015 | P1 | Confirmado | CSS com url() inválida substituída por none pode produzir declaração inválida em @font-face | `src/epub/sanitize/sanitizeCss.ts` | Remover/substituir a declaração relevante sem invalidar CSS |
| E-016 | P1 | Confirmado | CSS perigoso embutido pode causar remoção de todo o elemento style | `src/epub/sanitize/sanitizeActiveContent.ts` | Remoção granular ou aviso de perda de estilos |
| E-017 | P1 | Confirmado | Marcador de referência ausente substitui imagem, alterando texto/layout sem prévia | `src/epub/sanitize/sanitizeHtml.ts: replaceMissingImages` | Classificar como transformação visível, oferecer revisão/consentimento |
| E-018 | P1 | Confirmado | O score de segurança pode ficar 100 mesmo quando há falha fatal ZIP_RESOURCE_LIMIT | `src/epub/utils/reportBuilder.ts` | Separar segurança verificada, não verificada e restrições de integridade |
| E-019 | P1 | Confirmado | Troca de capa é disponibilizada sem gate equivalente sobre a validação final | `src/epub/cover/replaceCover.ts` | Alertar ou bloquear produto final que introduza regressões graves |
| E-020 | P2 | Confirmado | README exibe badge versão 2.0.0 embora package e release sejam 2.2.0 | `README.md; package.json` | Alinhar documentação à release atual |

## 2. Robustez ZIP/OCF, caminhos e codificações

| ID | Prioridade | Tipo | Item | Onde investigar | Critério de aceitação |
|---|---|---|---|---|---|
| E-021 | P1 | Testar | Nomes de entrada ZIP não UTF-8 e sinalização de encoding em flags | `src/epub/reader/rawZipInspector.ts` | Teste CP437/UTF-8 e fallback sem corrupção de nomes |
| E-022 | P1 | Testar | Caminhos com %23, %25, %2F, #, ?, Unicode NFC/NFD | `src/epub/utils/pathUtils.ts` | Proteger distinção entre nomes físicos e URL |
| E-023 | P1 | Testar | Colisões depois de decodificação, normalização ou diferença de caixa | `src/epub/reader/loadEpub.ts` | Não descartar silenciosamente entradas referenciadas |
| E-024 | P1 | Testar | Consistência entre nomes do diretório central e nomes vistos pelo JSZip | `src/epub/reader/rawZipInspector.ts; src/epub/reader/loadEpub.ts` | Comprovar identidade de entradas em casos adversariais |
| E-025 | P1 | Testar | Extra fields Unicode, data descriptors, tamanhos e offsets extremos | `src/epub/reader/rawZipInspector.ts` | Corpus de ZIPs legais e adulterados |
| E-026 | P1 | Testar | Sobreposição de payload ZIP, entrada duplicada e polyglots | `src/epub/reader/rawZipInspector.ts` | Rejeitar combinações perigosas sem falsos positivos em ZIP normal |
| E-027 | P1 | Testar | Arquivos e diretórios com nomes especiais ou caminhos relativos anômalos | `src/epub/reader/loadEpub.ts; src/epub/utils/pathUtils.ts` | Testes de round-trip dos nomes |
| E-028 | P1 | Testar | EPUB multipartes/ZIP64/criptografia rejeitados com diagnóstico preciso | `src/epub/reader/rawZipInspector.ts` | Distinguir formato não suportado de malware |
| E-029 | P1 | Testar | Manifest e container com múltiplos rootfiles/renditions | `src/epub/validation/opfParser.ts` | Selecionar rootfile corretamente ou explicitar limitações |
| E-030 | P1 | Testar | mimetype duplicado, diretórios primeiro, extras e arquivos de tamanho zero | `src/epub/reader/rawZipInspector.ts; src/epub/validation/validateZip.ts` | Verificar OCF sem gerar pacote ambíguo |
| E-031 | P1 | Testar | Picos de memória ao carregar/decompactar/revalidar várias vezes | `src/epub/reader/loadEpub.ts; src/epub/repair/repairEpub.ts` | Medições de memória real em browsers |
| E-032 | P2 | Evolução | Progresso, cancelamento e execução em Worker para EPUBs grandes | `src/app/actions.ts` | Não congelar a interface durante tarefas pesadas |
| E-033 | P2 | Testar | Preservação de encoding/declaracão XML ao reescrever XHTML/OPF | `src/epub/utils/xmlUtils.ts; src/epub/repair/repairOpf.ts` | Sem perda de caracteres ou prólogos válidos |
| E-034 | P2 | Testar | Tamanhos declarados ZIP diferentes dos fluxos descompactados | `src/epub/reader/loadEpub.ts` | Cobertura de limites com casos sintéticos |

## 3. Conformidade EPUB 2/3, OPF, navegação e referências

| ID | Prioridade | Tipo | Item | Onde investigar | Critério de aceitação |
|---|---|---|---|---|---|
| E-035 | P0 | Evolução | EPUBCheck oficial integrado à validação de arquivos reparados no CI | `CI; tests` | Comparar diagnósticos antes/depois com EPUBCheck 5.4.0 |
| E-036 | P1 | Evolução | Matriz separada EPUB 2, EPUB 3.0/3.2/3.3 e EPUB 3.4 | `src/epub/validation` | Aplicar regras adequadas à versão declarada |
| E-037 | P1 | Evolução | Links internos com fragmento inexistente (#id) | `src/epub/validation/validateContentReferences.ts` | Validar destino e id em XHTML/nav/NCX |
| E-038 | P1 | Evolução | Links de nav.xhtml e seus fragmentos, hierarquia toc e estrutura de lista | `src/epub/validation/validateNavigation.ts` | Validar mais do que a existência de nav epub:type=toc |
| E-039 | P1 | Evolução | NAV/NCX com URLs escapadas, fragmentos, âncoras internas e caracteres especiais | `src/epub/validation/validateNavigation.ts` | Resolver por URL/namespace corretamente |
| E-040 | P1 | Evolução | Suporte a page-list, landmarks e guide sem destruí-los | `src/epub/repair/repairNavigation.ts` | Preservar a navegação editorial e acessível |
| E-041 | P1 | Evolução | Validação de fallback e ciclos de referência de recursos foreign | `src/epub/validation/validateOpf.ts` | Reconhecer faltas e evitar correções destrutivas |
| E-042 | P1 | Evolução | Validar propriedades required do manifest: nav, cover-image, scripted, remote-resources etc | `src/epub/validation/validateOpf.ts` | Critérios por versão e conteúdo efetivo |
| E-043 | P1 | Evolução | Metadados package unique-identifier, dcterms:modified, prefix, refines e vínculos | `src/epub/validation/validateOpf.ts` | Validar obrigatoriedade e referências sem inventar dados |
| E-044 | P1 | Evolução | Spine linear, page-progression-direction, documentos estrangeiros e fallbacks | `src/epub/validation/validateOpf.ts` | Preservar ordem e direção de leitura |
| E-045 | P1 | Evolução | Controle de arquivos remotos permitidos por tipo, propriedade e versão | `src/epub/validation/opfParser.ts` | Não marcar automaticamente fontes HTTP/HTTPS legítimas como maliciosas |
| E-046 | P1 | Evolução | Fontes obfuscadas/legalmente ofuscadas e META-INF/encryption.xml | `src/epub/validation/validateZip.ts` | Distinguir DRM real de ofuscação legal de fontes |
| E-047 | P1 | Evolução | Media Overlays/SMIL, sincronização de áudio e vídeos, quando presentes | `src/epub/validation` | Não danificar links entre texto e mídia |
| E-048 | P1 | Evolução | Metadados fixed-layout e documentos SVG no spine | `src/epub/validation` | Preservar apresentação fixa e fallback |
| E-049 | P2 | Evolução | MathML, ruby, RTL, escrita vertical e idiomas mistos | `src/epub/validation` | Evitar mudanças indevidas de semântica e renderização |
| E-050 | P2 | Evolução | Declarações de imagem de capa em OPF/guide/nav/cover-image | `src/epub/cover/replaceCover.ts` | Sincronizar referências sem imagens obsoletas |

## 4. Sanitização e política de segurança

| ID | Prioridade | Tipo | Item | Onde investigar | Critério de aceitação |
|---|---|---|---|---|---|
| E-051 | P0 | Testar | Verificação dos arquivos JS/binários não mencionados no fluxo de sanitização | `src/epub/repair/repairContentDocuments.ts; src/epub/utils/constants.ts` | Inventariar recursos executáveis/suspeitos sem excluir cegamente |
| E-052 | P0 | Testar | Sanitização de todo conteúdo ativo em cada modo de reparo, inclusive conservador | `src/epub/repair/repairEpub.ts` | Não chamar seguro arquivo cuja ameaça continua |
| E-053 | P1 | Testar | Atributos URL que usam entidades, controles, espaços e codificações alternativas | `src/epub/sanitize/sanitizeActiveContent.ts` | Cobertura adversarial de esquemas perigosos |
| E-054 | P1 | Testar | CSS url(), @import, escapes e comentários com sintaxe adversarial | `src/epub/sanitize/sanitizeCss.ts` | Cobertura de falsos negativos e falsos positivos |
| E-055 | P1 | Testar | SVG com URI/script/eventos/namespace e recursos incorporados | `src/epub/sanitize/sanitizeActiveContent.ts` | Não destruir SVG legítimo nem reter conteúdo ativo perigoso |
| E-056 | P1 | Testar | XML com DTD/XInclude/entidades externas e DOCTYPE incomum | `src/epub/utils/xmlUtils.ts` | Evitar leituras indevidas e distinguir documentos válidos |
| E-057 | P1 | Testar | data: image/font (passivo) versus data: HTML/SVG executável | `src/epub/sanitize/sanitizeActiveContent.ts` | Política por contexto do atributo, não apenas protocolo |
| E-058 | P1 | Evolução | Detectar MIME por assinatura para anexos suspeitos (sem executar arquivos) | `src/epub/reader/loadEpub.ts` | Avisar executáveis/binários indevidos e incompatibilidades |
| E-059 | P1 | Evolução | Scan AV opcional fora do navegador, sem alegar antivírus integrado | `Documentação e testes` | Definir política de malware e limites honestos |
| E-060 | P1 | Evolução | Modelo de ameaças EPUB e checklist de privacidade de recursos externos | `docs; security tests` | Preservar URLs passivas por padrão e sinalizar rede/offline separadamente |
| E-061 | P1 | Evolução | Separar score de segurança de inspeção de conformidade e de integridade | `src/epub/utils/reportBuilder.ts` | Não exibir selo de arquivo seguro sem evidência |
| E-062 | P2 | Testar | Headers CSP/Netlify e comportamento de previews/blob/data em navegadores | `netlify.toml` | Testes de produção sem bloqueios nem permissões excessivas |
| E-063 | P2 | Evolução | Fuzzing determinístico de ZIP/XML/SVG/CSS/OPF e limites contra ReDoS | `tests/adversarial*.test.ts` | Capturar crashes, tempo excessivo e bypasses |

## 5. Preservação editorial e fidelidade de livro

| ID | Prioridade | Tipo | Item | Onde investigar | Critério de aceitação |
|---|---|---|---|---|---|
| E-064 | P0 | Evolução | Comparar texto integral pré/pós e avisar alterações não previstas | `src/epub/repair/repairEpub.ts` | Provar que reparo estrutural não apagou parágrafos |
| E-065 | P0 | Evolução | Comparar ordem de leitura, capítulos, IDs e links antes/depois | `src/epub/repair/repairEpub.ts` | Sem inversão, perda ou duplicação de capítulos |
| E-066 | P1 | Evolução | Verificar integridade binária das imagens/fontes que não deveriam ser alteradas | `src/epub/repair` | Hashes antes/depois de recursos não tocados |
| E-067 | P1 | Evolução | Validar imagens por dimensões, assinatura, decodificação e pixels quando alteradas | `src/epub/repair/repairImages.ts` | Sem perda visual involuntária |
| E-068 | P1 | Evolução | Consertos de headings, capítulos, títulos de navegação e sumários editoriais | `src/epub/repair/repairNavigation.ts` | Manter hierarquia e nomes editoriais reais |
| E-069 | P1 | Evolução | Detectar OCR malformado, quebras artificiais, hifens, cabeçalhos e rodapés | `novo módulo opcional de diagnóstico editorial` | Apenas sugestão/revisão assistida antes de tocar texto |
| E-070 | P1 | Evolução | Diagnóstico de CSS redundante/contraditório ou referências de estilos quebradas | `src/epub/validation/validateCssReferences.ts` | Limpeza só quando demonstravelmente equivalente |
| E-071 | P1 | Evolução | Notas de rodapé, backlinks, endnotes, índices e remissões internas | `src/epub/validation` | Verificar destinos e preservar semântica |
| E-072 | P1 | Evolução | Acessibilidade editorial: alt, lang, semântica, nav e leitura assistiva | `src/epub/validation` | Oferecer avisos de qualidade, não modificar obra arbitrariamente |
| E-073 | P1 | Evolução | Fluxo antes/depois com diffs de XHTML, CSS, OPF e NCX | `src/ui; src/epub/repair` | Deixar alterações verificáveis e auditáveis |
| E-074 | P2 | Evolução | Preservar tipografia, itálicos, travessões, espaçamento e estilos de diálogo | `novo módulo opcional` | Não “corrigir” estilo sem prova de erro |
| E-075 | P2 | Evolução | Tratamento opcional de EXIF/XMP/Photoshop/metadata de imagens | `src/epub/repair/repairImages.ts` | Não remover metadados nem recomprimir por padrão |
| E-076 | P2 | Evolução | Checagem de apresentação em leitores reflowable/fixed layout, imagens e fontes | `testes de renderização` | Comparação visual em páginas críticas |

## 6. Interface, experiências de uso e confiabilidade

| ID | Prioridade | Tipo | Item | Onde investigar | Critério de aceitação |
|---|---|---|---|---|---|
| E-077 | P1 | Evolução | Estados explícitos: seguro para reparar, revisão manual, parcial, otimização, inválido | `src/ui/components/Controls.ts; src/ui/components/IssueList.ts` | Comunicar resultado e incertezas com clareza |
| E-078 | P1 | Evolução | Prévia e confirmação de operações destrutivas antes de executar | `src/ui/components/OptionsPanel.ts` | Opt-in em mudanças de texto/imagem/índice |
| E-079 | P1 | Evolução | Indicador de ações não aplicadas e pendências remanescentes por item | `src/ui/components/RepairSummary.ts` | Relatório mostra exatamente o que foi e não foi corrigido |
| E-080 | P1 | Evolução | Fila e interrupção de tarefas grandes, feedback de processamento real | `src/app/actions.ts` | Evitar travamento da aba e reentrância |
| E-081 | P1 | Testar | Trocar de arquivo/opções enquanto análise ainda está em execução | `src/app/actions.ts; src/app/createApp.ts` | Não misturar estado de livros diferentes |
| E-082 | P1 | Testar | Download blob em Safari/iOS, liberação imediata de ObjectURL | `src/ui/dom.ts` | Downloads concluídos em navegadores suportados |
| E-083 | P2 | Testar | Teclado, leitor de tela e foco após rerender completo | `src/app/createApp.ts; src/ui/components` | Atender navegação por teclado e avisos ARIA |
| E-084 | P2 | Evolução | Exportar relatório técnico com prova de versão, opções e hash do original | `src/ui/copyReport.ts` | Auditoria reproduzível entre versões |
| E-085 | P2 | Evolução | Manual de limitações (correção técnica vs editorial vs antivírus vs EPUBCheck) | `README.md; UI` | Não prometer perfeição ou ausência de vírus |

## 7. Qualidade, testes, release e governança

| ID | Prioridade | Tipo | Item | Onde investigar | Critério de aceitação |
|---|---|---|---|---|---|
| E-086 | P0 | Evolução | Corpus de EPUBs sintéticos derivado dos defeitos reais observados nos chats | `tests/` | Reproduzir regressões de Duna, Alerta Vermelho, Você, Harry Quebert etc sem publicar livros protegidos |
| E-087 | P1 | Confirmado | CI executa em push para prod e PR para prod, não em push para dev | ` .github/workflows/ci.yml` | Executar gate em toda alteração na dev |
| E-088 | P1 | Confirmado | Workflow release manual aceita disparo sem condição de sucesso da CI | ` .github/workflows/release.yml` | Exigir commit aprovado mesmo em workflow_dispatch |
| E-089 | P1 | Evolução | Matriz de browsers Chromium/Firefox/WebKit e dispositivos móveis | `tests/; CI` | Validar DOMParser, canvas, download e arquivos grandes |
| E-090 | P1 | Evolução | Matriz de leitores: Kindle Previewer, Calibre e leitores EPUB 2/3 | `tests/; docs` | Diferenciar conformidade de aceitação por dispositivo |
| E-091 | P1 | Evolução | Regressão diferencial: EPUBCheck original × reparado | `tests/; CI` | Não introduzir novos erros de conformidade |
| E-092 | P1 | Evolução | Validação pós-reparo de conteúdo real e links, não só ZIP/OPF | `tests/` | Capturar perda de capítulos e quebra de referências |
| E-093 | P1 | Evolução | Testes de propriedades: idempotência e preservação de bytes em no-op | `tests/` | Reparar 2x sem mudanças adicionais ou falsos resultados |
| E-094 | P1 | Evolução | Testes adversariais com SVG/CSS/XML e ZIP fuzzing recorrente | `tests/` | Medir taxa de falhas e regressões |
| E-095 | P2 | Evolução | Cobertura de testes e thresholds por módulo crítico | `vitest.config.ts; CI` | Evitar quedas de cobertura em parsers e reparos |
| E-096 | P2 | Evolução | Testes de performance/memória com limites documentados | `tests/; CI` | Definir orçamento para EPUBs de 1MB a 250MB |
| E-097 | P2 | Evolução | Versionamento das decisões, changelog e matriz de suporte | `README.md; .github/release-notes/` | Documentar funcionalidades, limitações e exceções |
| E-098 | P2 | Evolução | Revisar regras de proteção da dev e política de branch/tag | `GitHub settings` | Aprovar alterações antes de produção |
| E-099 | P2 | Evolução | Análise periódica de dependências e licenças além do npm audit | `package.json; .github/dependabot.yml` | Complementar análise sem substituir testes funcionais |

## Comprovações já existentes e que não devem ser desfeitas
- v2.2.0 publicada após CI Node 20/22 bem-sucedido; PRs 25, 27, 28 e 29 integrados.
- Limites ZIP e CRC32, parsing dos cabeçalhos, sanitização baseada em DOM, verificação de scripts, bloqueio de esquemas executáveis e opção conservadora já existem, embora necessitem de testes complementares.
- Fontes externas HTTP/HTTPS, @font-face, @import e fontes data:font preservadas por padrão no CSS.
- NCX editorial seletivo é aceito: não exigir um navPoint por item do spine.
- EPUB 3 não exige NCX legado; prefixos de namespace no nav.xhtml são aceitos.
- JPEG progressivo é classificado como otimização opcional; a inconsistência indicada é sua execução no fluxo obrigatório.

## Evidência histórica recuperada
- **Harry Quebert:** referências kindle:embed, imagens ausentes, links e OPF; marcador visível solicitado pelo usuário.
- **Você - Volume 1:** NCX/XML inválido, capítulos e ordens, page-map ausente, capa, resíduos de conversão e MIME OpenType.
- **As Brigadas Fantasma:** falso positivo do NCX seletivo; corrigido em v2.2.0.
- **Alerta Vermelho:** preservar fontes e imagens, interpretar JPEG progressivo como otimização e verificar riscos sem falso positivo.
- **Amanhecer na Colheita:** revisão histórica inclui metadados JPEG (EXIF/XMP), sumários, segurança estática e preservação de texto; isso não cria obrigação de limpar EXIF por padrão.
- **Duna:** revisões com problemas estruturais, navegação, espaçamento e imagens; não há comprovação de equivalência automatizada.
- **Os Funcionários:** origem PDF/OCR, quebras e hifenização, sem alteração editorial automática segura garantida.
- O histórico também inclui O Exorcista, Clube da Luta, Devoradores de Estrelas e outros, mas a busca contextual não garante recuperação de cada arquivo e cada decisão de todos os chats.

## Passos para transformar inventário em auditoria verificável
1. Criar um teste mínimo que reproduza cada item `Confirmado` e validar se a hipótese afeta um EPUB real ou sintético.
2. Executar testes adversariais de todos os itens `Testar`, marcando confirmado, descartado ou limitação conhecida.
3. Separar capacidades `Evolução` em: conformidade essencial, preservação editorial, compatibilidade opcional, fora de escopo.
4. Usar EPUBCheck 5.4.0, checagem de preservação de texto/imagem, testes de browser e Kindle Previewer na mesma matriz de regressão.
5. Após cada correção futura, verificar todos os casos anteriores e repetir a varredura de novas classes de problemas. Uma auditoria nunca é matematicamente exaustiva.