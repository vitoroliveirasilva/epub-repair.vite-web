# Histórico de mudanças do EPUB Repair

## v4.0.0 — desenvolvimento na dev (não lançada, 12/11/2026)
- Refinamento minimalista do tema editorial nas duas telas: cards com bordas sutis, hierarquia tipográfica enxuta e menos efeitos visuais. Configurações avançadas EPUB ficam recolhidas por padrão, sem painel lateral; a abertura do PDF deixa de exibir cartões promocionais redundantes.
- Nova direção editorial na página de reparo com Lumina, hero simplificada sem cartões de benefícios e navegação superior; ícone de livros personalizado na navbar e favicon das duas telas.

- Permite selecionar ou arrastar múltiplos EPUBs no upload principal, abrindo automaticamente o lote; também suporta um ou vários arquivos na área dedicada.
- Separa análise em lote de correção completa opt-in e aplica reparos e otimizações de compatibilidade a cada EPUB elegível, com relatórios de mudanças realmente aplicadas.
- Limita o tempo de decodificação de JPEG progressivo e permite cancelar a otimização de imagem, impedindo que um recurso sem evento de carregamento trave o processamento em lote.

- Finaliza o editor opcional de metadados: autores reorganizados sem perder identidades e refinamentos, funções MARC EPUB 2/3, correção de múltiplas coleções/séries e preservação de identificadores.
- Amplia a preparação Kindle para dez verificações com bloqueios, acessibilidade, layout, segurança, ações guiadas e exportação de diagnóstico JSON.
- Completa o fluxo funcional da revisão assistida de PDFs com exportação JSON integral, filtros de prioridade, marcação de conferência e verificação de figuras sem referência.
- Melhora o lote local com etapas e progresso por EPUB, relatórios individuais para recusados, resumo JSON/TXT, validação final, isolamento de falhas e cancelamento sem ZIP parcial.
- Finaliza o escopo técnico de prévia estruturada: CSS seguro limitado, imagens dentro de células, navegação de notas em outros capítulos e 240 seções com orçamento global de memória.
- O comparador aplica estilos visuais seguros aproximados, acompanha imagens em tabelas e oferece rolagem proporcional sincronizável entre as versões.
- Aprimora o leitor EPUB: tabelas estruturadas, fusões de células, notas de rodapé recolhíveis, referências internas seguras, listas numeradas e prévia explicativa de layout fixo.
- Comparação editorial detecta alterações tipográficas, estrutura de títulos e tabelas, notas, imagens e assinaturas de CSS/classes além das diferenças textuais. Não executa estilos originais nem declara equivalência pixel a pixel.

- Valida a integridade do EPUB final contra o conteúdo editado: capítulos no spine, texto e imagens no XHTML e no manifesto. Impede download quando houver perda objetiva e mostra verificação no resultado.
- Preserva alterações manuais nas páginas visuais, inclusive após edição simples que remove marcadores; o revisor PDF avisa quando a cobertura textual por página fica suspeitamente baixa.
- Impede exclusão de capítulos numerados por falso cabeçalho recorrente, protege figuras em páginas sem texto após filtros e separa fragmentos curtos distantes na mesma altura.
- Corrige a leitura de PDFs em duas colunas com linhas na mesma altura, reorganiza títulos que atravessam a página e intercala ilustrações conforme a coluna. O revisor aponta grades tabulares que merecem conferência.
- Revisor PDF ordena alertas por prioridade, exibe evidências e impede que a normalização de espaços destrua imagens ou formatação HTML.
- Kindle oferece checklist de oito categorias com orientações específicas e distinção entre bloqueios e conferências.
- Prévia preserva ênfases e elementos tipográficos básicos sem injetar HTML do EPUB; oferece anterior/próximo.
- Edição de metadados mantém rascunhos entre as ferramentas, valida campos alterados e permite descartar edições sem substituir o arquivo original.
- Novo painel recolhido de ferramentas opcionais para EPUB: prévia textual, comparação lado a lado, metadados, checklist Send to Kindle e lote sequencial com limite de memória.
- Revisão PDF assistida por heurísticas de OCR, coluna, texto visual e formatação, com intervenção explícita do usuário.
- Produção e release oficial mantidas em `v3.0.0` até autorização de merge. Escopo e limitações registradas em [V4_0_0_DEV.md](docs/V4_0_0_DEV.md).



> **Nota de leitura (12/11/2026):** a versão `3.0.0` reúne melhorias posteriores à `v2.5.0`. A publicação da tag depende da CI aprovada na `prod`. Entradas anteriores são preservadas como **registro histórico**, inclusive frases escritas antes de versões já publicadas. Estado operacional: [ESTADO_ATUAL.md](docs/ESTADO_ATUAL.md).

## v3.0.0 (12/11/2026)

Versão major que consolida as melhorias posteriores à `v2.5.0`, especialmente o novo conversor PDF → EPUB. [Notas detalhadas](.github/release-notes/v3.0.0.md). A tag é gerada automaticamente após aprovação da CI na `prod`.

- **Conversor PDF → EPUB** publicado na rota `/converter` ([PR #43](https://github.com/vitoroliveirasilva/epub-repair.vite-web/pull/43)), com PDF.js, OCR local Tesseract.js, reconstrução de texto, edição editorial, formato reflowable/fixed e validação final pelo motor EPUB.
- **Confiabilidade de extração**: fluxo OCR com timeout/fallback, preservação de ilustrações, quadros e formulários, correção de espaços entre trechos de fontes diferentes e de metadados ISBN/CDD/CDU ([PRs #44–#47](https://github.com/vitoroliveirasilva/epub-repair.vite-web/pulls?q=is%3Apr+is%3Amerged+base%3Aprod)).
- **UX de reparo e conversão**: cartões de conferência manual/erros responsivos, avisos do conversor com altura livre e revisão avançada que não fecha ao mudar de seção ([PRs #48–#50](https://github.com/vitoroliveirasilva/epub-repair.vite-web/pulls?q=is%3Apr+is%3Amerged+base%3Aprod)).
- **Progresso e resultado**: spinner contínuo sem ser remontado por página, remoção do ícone de verificado no título da conversão concluída ([PR #51](https://github.com/vitoroliveirasilva/epub-repair.vite-web/pull/51)).
- **Navegação móvel**: menu lateral com modal de tela inteira, links EPUB/PDF, tecla Escape, foco e animação respeitando movimento reduzido ([PRs #51–#53](https://github.com/vitoroliveirasilva/epub-repair.vite-web/pull/53)).
- **Footer**: quatro links fixos nas duas rotas (Desenvolvedor, Projeto no GitHub, Reparar EPUB e Converter PDF) ([PR #54](https://github.com/vitoroliveirasilva/epub-repair.vite-web/pull/54)).

A versão `3.0.0` mantém coerência entre `package.json` e `package-lock.json`, com notas próprias e publicação após CI. Compatibilidade visual de PDFs diversos e homologação em aparelhos físicos continuam sujeitas a testes específicos.

## v2.5.0 (release publicada em 11/11/2026 UTC)

- Recuperação conservadora de divisões editoriais internas em EPUB 2;
  capítulos em XHTML compartilhado e NCX incompleto podem ser identificados
  com heurísticas e ressalvas de revisão editorial.
- Navegação reconstruída sem subdivisões artificiais, preservando estrutura
  existente, ordem do spine e recursos não gerados pelo app.
- Ajustes de inferência de epígrafes e capítulos com indicação informativa,
  sem transformar uma hipótese editorial em certeza.
- Vite 8.3.6, validações estáticas e suíte de regressão na candidata.

Registro oficial: [release v2.5.0](https://github.com/vitoroliveirasilva/epub-repair.vite-web/releases/tag/v2.5.0).
A tag representa o código da release, não as alterações posteriores listadas acima.

## v2.4.0 (histórico da candidata de novembro de 2026; posteriormente promovida)

- Limpeza de comentários de implementação, configurações e testes, preservando
  diretivas executáveis (shebang), conteúdo literal e licenças. Testes que
  dependiam de comentários `@vitest-environment` agora usam projetos
  explícitos `dom` e `node` no Vitest; exceções de lint usam configuração
  específica por arquivo. Nenhuma mudança funcional foi pretendida.
- Configuração proposta de Dependabot aponta atualizações de versão para
  `dev`, após adoção pela branch padrão `prod`, preservando análise
  separada das PRs existentes e dos alertas de segurança.

- Acessibilidade: SVG simples que contém exclusivamente a imagem da capa oficial
  pode receber rótulo usando o título já existente na página, por otimização
  opcional segura. Diagramas e ilustrações complexas permanecem em revisão manual;
  a auditoria editorial autoriza apenas os atributos de acessibilidade registrados.
- UI: barra e indicador de processamento centralizados, ocupando 100% da largura
  do card em desktop e mobile, preservando porcentagens e cancelamento.

- Score Kindle: notas `INFO` sem ação de reparo não reduzem a pontuação; observações de acessibilidade continuam visíveis e otimizações opcionais continuam pontuadas. Um EPUB apenas com nota informativa pode alcançar 100/100.

- Homologação real com EPUB 2 privado: texto de todos os 8 XHTML, ordem do
  spine, identificadores, referências e NCX preservados; 395 entidades
  `&nbsp;` normalizadas sem mudança no texto renderizado. Sem inserir o
  arquivo privado no repositório.
- Testes locais no Windows: corrigir nome de fixture com `?` (caractere
  inválido no NTFS), executar mock de scanner por Node sem shell e
  normalizar CRLF nas asserções da política econômica de CI.
- Interface: o cartão ilustrativo de score (92) passa a ter rótulo
  explícito quando não existe EPUB carregado e mostra as métricas
  **reais** quando um relatório está disponível.

Esta entrada registra apenas mudanças existentes na `dev`, ainda
pendentes de homologação pré-merge e aprovação. A produção permanece
em v2.3.0 até a conclusão do processo.

- Reforço do gate editorial nas rotas de reparo **e otimização**, com
  rejeição segura de alterações não verificáveis em HTML legado.
- Regressão EPUB 2: preservar o idioma explícito de cada página ao
  completar `lang/xml:lang`, mesmo se for diferente do idioma principal do OPF.
  Isso impede o aviso `CONTENT_LANGUAGE_CONFLICT` introduzido no reparo.
  Na troca de capa, não inserir `properties="cover-image"` de EPUB 3 no OPF 2.
- Proteção das estruturas e apresentações: ordem do spine, tabelas,
  âncoras, NAV EPUB 3, NCX hierárquico, MathML, ruby, SVG inline,
  estilos visuais, mídias e folhas CSS vinculadas.
- Substituição de capa com aprovação restrita às páginas de rosto e às
  folhas CSS clonadas, sem alterar estilos de capítulos compartilhados.
- Preservação de fontes, URLs HTTP(S) e links legítimos por padrão;
  remoção opcional de recursos remotos somente sob consentimento.
- Testes ampliados com três amostras **oficiais W3C EPUB Tests** de
  XHTML, MathML e SVG, além de variantes com scripts adversariais.
- Base automatizada anterior à candidata: **580 testes em 112 arquivos**
  e CI rápida Node 22 aprovada. Este número não corresponde à
  homologação de release v2.4.0.
- **Limitações mantidas:** E-082 e E-089 dependem de teste em hardware
  iOS/Android físico; a matriz de release deve ser executada no SHA
  exato da candidata antes de qualquer promoção.

Detalhes, critérios objetivos e dependências adiadas em
[plano da candidata](docs/RELEASE_2_4_0_CANDIDATA.md).


## v2.3.0 (08/11/2026)

Esta versão consolida as auditorias originais e complementares desenvolvidas na `dev`. A publicação em `prod` é controlada por PR, pelos checks de Node 20/22 e pela CI completa de produção. Os registros abaixo são históricos de desenvolvimento, não certificações universais de compatibilidade.

- Robustez de EPUB/ZIP/XML/OPF/NCX/NAV, preservação de capítulo, capa, anotações, CSS e mídia, e correção de casos adversariais.
- Workers para compactação e extração, progresso e cancelamento, fila de operações, relatórios e melhorias da interface.
- Endurecimento de segurança conservador, sem classificar fontes/links HTTP(S) legítimos como malware automaticamente.
- Auditoria original: **97 de 99 concluídos no escopo automatizado; E-082 e E-089 ainda requerem aparelhos físicos**.
- Correções complementares E-100 a E-157 documentadas e testadas na `dev`.
- Homologação em Android/iOS físicos e aparência em leitores reais continuam limitadas. Simuladores e EPUBCheck não substituem testes físicos; esta versão não é antivírus.

Detalhes e evidências em [notas de release](.github/release-notes/v2.3.0.md), [auditoria dos 99](docs/AUDITORIA_99_PROGRESSO.md), [pós-99](docs/AUDITORIA_POST99.md) e [roteiro de homologação](docs/HOMOLOGACAO_MOBILE_REAL.md).

## Histórico de desenvolvimento: execução 10 (05/11/2026)

- Extração ZIP/CRC em Web Worker same-origin com progresso real, cancelamento e fallback seguro em navegadores sem Worker.
- Botão de cancelamento, bloqueio de resultados atrasados, checkpoints no reparo/troca de capa e progresso de recompactação JSZip.
- Guarda editorial contra perda de itálicos, negrito, espaços em código, estilos seguros, classes, versos e diálogos.
- Diagnósticos conservadores de `noteref`/notas/backlinks, `aria-labelledby` e nome acessível de SVG inline.
- Inventário não destrutivo de EXIF/XMP/Photoshop em imagens JPEG/PNG/WebP.
- Regressões de revalidação independente da saída ZIP, links e imagens e gate contra novos erros.
- Documentação da CSP Worker e verificação remota do ruleset real da `prod`.

**Auditoria:** 75 concluídos, 21 parciais e 3 pendentes. 
O processamento DOM ainda não pode ser cancelado no meio de uma fase síncrona; não houve homologação física em leitores/navegadores.

## Histórico de desenvolvimento: execução 9 (05/11/2026)

- Fallbacks de tipos estrangeiros, incluindo imagens HEIC em XHTML e fallback XHTML/SVG no spine. Nenhum conteúdo de leitura é inventado.
- Validação de datas UTC, unique-identifier, prefixos e refines do OPF sem alteração arbitrária dos metadados.
- Verificação de conteúdo remoto por MIME e versão EPUB, preservando fontes e links HTTPS legítimos.
- Media Overlays: IDs, namespaces, fontes MIME e integridade dos vínculos/bytes SMIL antes/depois do reparo.
- Reutilização dos arquivos ZIP já descompactados entre inspeção inicial e reparo, com regressões de equivalência de relatório.
- Matriz de testes da ordem de leitura e recursos estrangeiros.

**Auditoria:** 72 concluídos, 19 parciais e 8 pendentes. Leitores e navegadores físicos permanecem fora da cobertura automatizada.

## Histórico de desenvolvimento: execução 8 (05/11/2026)

- Corrigida a perda de referências a renditions secundárias quando o container possui múltiplos rootfiles válidos.
- Manifests de edições diferentes não são fundidos automaticamente e revisões parciais ficam identificadas.
- Inspeção estrutural de scripts/embeds e extração de links reais sem falso positivo em comentários ou código editorial.
- Inventário de JavaScript declarado e órfão, incluindo avisos de revisão manual nos modos de reparo e otimização.
- Proteção de nomes ZIP e validação de anchors/fragmentos Unicode em NAV/NCX.
- Regressões de payloads polyglot ZIP e respeito a comentários ZIP legítimos.
- Testes da configuração CSP/Netlify; comportamento real em WebKit e headers HTTP ainda pendente.

**Auditoria:** 67 concluídos, 24 parciais e 8 pendentes, conforme o [quadro por item](docs/AUDITORIA_99_PROGRESSO.md).

## Histórico de desenvolvimento: auditoria dos 99 itens, execuções 1 a 6 (05/11/2026)

### Segurança de entradas e integridade

- Verificação dos cabeçalhos ZIP, duplicatas, sobreposição, offsets, CRC, descritores de dados, ZIP64 e multipartes; formatos ambíguos são recusados.
- Proteção de descompactação por limites de entrada e de bytes; fluxo extraído verificado contra o tamanho declarado.
- XML com entidades externas e inclusões perigosas bloqueadas; DTDs legadas conhecidas NCX/XHTML tratadas estritamente.
- Inspeção de URLs e CSS ativos após decodificação, preservando links/fontes HTTP/HTTPS legítimos.
- Diagnóstico de anexos com assinatura de executável e inventário de scripts declarados e órfãos. O app não substitui antivírus.

### Preservação e conformidade editorial

- Proteções sobre capítulos, ordem do spine, `linear`, texto integral, parágrafos, headings, IDs, notas e remissões.
- Proteção de destinos NCX e estruturas específicas MathML, ruby e direção explícita de leitura RTL.
- Inspeção de navegação EPUB 3 (`toc`, `page-list`, `landmarks`) e metadados OPF.
- Verificação não destrutiva de SMIL/Media Overlays e EPUB 3 fixed-layout.
- Diagnósticos de CSS repetido/sobrescrito e múltiplas declarações de capa sem alteração editorial arbitrária.

### Qualidade e interface

- Reparo sem mudanças não cria cópia artificial; testes de idempotência e bytes preservados para diversos cenários.
- Manutenção de foco/cursor em redesenhos de tela e relatórios técnicos comparando XHTML, CSS, OPF e NCX antes/depois.
- Relatório de SHA-256 do EPUB originalmente carregado, snapshot das opções e ações realmente realizadas.
- EPUBCheck 5.4.0 nas fixtures sintéticas EPUB 2 e 3, CI em Node.js 20/22 com testes, lint, build e auditoria de dependências/licenças.

### Limitações e bloqueios de release

- Ainda restam itens parciais ou não iniciados em [AUDITORIA_99_PROGRESSO.md](docs/AUDITORIA_99_PROGRESSO.md).
- Faltam testes visuais e homologação em leitores/dispositivos físicos; EPubCheck e testes sintéticos não provam universalidade.
- Nenhum merge de `dev` em `prod` deve ser feito antes da revisão dos P0, da CI e da homologação de conteúdo real.

## v2.2.0: versão publicada

A release estável permanece inalterada nesta execução. Consultar [notas oficiais](.github/release-notes/v2.2.0.md) e tags do repositório.
