# Histórico de mudanças do EPUB Repair

## v2.4.0 (candidata, **não publicada**)

Esta entrada registra apenas mudanças existentes na `dev`, ainda
pendentes de homologação pré-merge e aprovação. A produção permanece
em v2.3.0 até a conclusão do processo.

- Reforço do gate editorial nas rotas de reparo **e otimização**, com
  rejeição segura de alterações não verificáveis em HTML legado.
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
