# Decisões técnicas e changelog da auditoria

> **Histórico de decisões e execuções, preservado.** As frases “produção v2.2.0”/“v2.3.0” e “candidata v2.4.0” descrevem datas anteriores; a release confirmada mais recente em 12/11/2026 é `v2.5.0` com melhorias pós-tag em `prod`. Consulte [Estado atual](ESTADO_ATUAL.md), [Arquitetura](ARQUITETURA.md) e [Changelog](../CHANGELOG.md) para a situação vigente.


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

## Execução 9: fallbacks e recursos dependentes

- Um recurso estrangeiro só substitui documento do spine com fallback XHTML/SVG **local e verificável**. Fontes, áudio e conteúdo extra fora da ordem de leitura não são julgados capítulos.
- Formatos estrangeiros embutidos (por exemplo HEIC) precisam de fallback core conforme o contexto; nenhum substituto é inventado ou apagado.
- Recursos remotos HTTPS de áudio, vídeo e fontes são legítimos e não equivalem a malware. URLs HTTP recebem informação sobre transporte/compatibilidade, não rótulo de ameaça.
- OPF com timestamp inválido e metadados prefixados ambíguos recebe diagnóstico; o reparo não altera datas/autoria arbitrariamente.
- Media Overlays/SMIL precisam permanecer byte a byte intactos quando a operação não contempla editar narração; os vínculos `media-overlay` também não podem desaparecer.
- A inspeção inicial agora reutiliza os dados já abertos pelo leitor ZIP no reparo, sem dispensar a verificação estrutural final.
- Homologações de reprodução áudio/texto e dispositivos físicos continuam limitações externas, mesmo com critérios automatizados E-047 encerrados.

Veja [auditoria de 99 itens, execução 9](AUDITORIA_99_PROGRESSO.md).

## Execução 10: Worker parcial, metadados e estrutura editorial

- O Worker local executa a extração ZIP limitada e transfere buffers válidos de volta ao navegador principal; não chama DOMParser nem canvas em Worker.
- O botão **Cancelar** termina imediatamente a extração via Worker. As etapas de XML/DOM, imagens e alguns blocos de compressão ainda não são interrompíveis no meio de uma operação síncrona, e o sistema descarta qualquer resultado após o sinal de abort.
- A CSP foi atualizada para `worker-src 'self'`, sem permitir `blob:` ou `data:` em scripts.
- A preservação editorial confere também tags de ênfase, quebras de verso, spans com classes, estilos inline passivos e pré-formatação de código.
- EPUBs com notas de rodapé e endnotes são verificados por vínculos semânticos; notas sem backlink explícito são aceitas.
- EXIF/XMP/Photoshop são diagnosticados informativamente e **não são apagados**: orientação, cor, autoria e dados pessoais podem estar nos metadados.
- O ruleset remoto "Protect prod" está ativo para `prod`. Nenhum ruleset de `dev` foi encontrado na enumeração de 05/11/2026; os endpoints de branch protection retornaram 403. Uma configuração que obrigue PR na `dev` interromperia o atual compromisso de commits diretos, portanto não foi aplicada.


## Execução 11: política de proteção não destrutiva

- Novo comando `scan:av` usa ClamAV instalado localmente; não envia arquivo pela aplicação. Um resultado sem assinatura não comprova ausência de malware e o CI só executa simuladores de scanner.
- CSS: comentários e HTTPS legítimos não devem gerar reescrita nem falso alarme de ameaça; códigos executáveis que não forem neutralizados exigem revisão manual e interrompem a saída.
- SVG: somente contextos de imagem podem preservar `data:image` raster; nunca tratar `data:image/svg+xml` ativo como raster seguro.
- Idiomas, `xml:lang`, escrita vertical e marcações matemáticas devem sobreviver ao reparo. A normalização equivalente de atributos de idioma não é regressão.
- Diagnósticos de OCR e acessibilidade não autorizam reescrever conteúdo editorial.
- Matriz desktop e viewport móvel automatizada não significa homologação em dispositivos reais. `prod` permanece intacta.

**Balanço:** 81 concluídos, 16 parciais, 2 pendentes (escopo automatizado); evidências [CI](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42110160755) e [browsers](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42109904354).

## Execução 12: fechamento medido e limitações não negociáveis

- ZIP CP437 pode ser lido sem introduzir U+FFFD: decodificação é compartilhada entre inspeção e extrator, UTF-8 explícito inválido continua rejeitado, nomes em colisão não são fundidos. Caso de encoding intrinsecamente ambíguo ainda exige cautela.
- A conversão de JPEG progressivo e a normalização de capa devem revalidar assinatura, decodificação, dimensões e amostra de cores antes de substituir bytes, sem remover metadados por padrão.
- Captura de screenshot e medição de DOM em Chromium/Firefox/WebKit antes/depois de reparo de EPUB sintético comprovam apenas **renderização nos engines de navegador**. Não equiparar isso a homologação de leitores de livros nem a Safari iOS físico.
- CI de cobertura V8 foi implantada com **thresholds por arquivo** em cinco módulos críticos. O gate aprovado não afirma cobertura integral do repositório.
- Testes de fuzz com casos degenerados foram expandidos para verificar orçamento de execução com duração limitada, sem alegar proteção absoluta contra toda entrada patológica.
- O inventário passa a **85 concluídos, 14 parciais, 0 pendentes** na classificação original; os parciais restantes devem ser encerrados apenas após evidência real e testes abrangentes, não por mudança arbitrária de status.

Evidências: [CI 42144065865](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42144065865),
[cobertura 42143349561](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42143349561),
[browsers 42143349623](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42143349623).
`prod` permanece intacta.

## Execução 13: metadados, especificação EPUB3 e teste real de CSP

- O OPF `package version="3.0"` é o valor válido para EPUB 3.0, 3.2, 3.3 e 3.4;
  não inferir a minor edition por esse atributo nem reescrever uma versão arbitrária.
- A remoção EXIF/XMP/Photoshop é **opt-in**, com confirmação e cópia nova.
  Preserva ICC e pixels sem reamostragem. EXIF com orientação diferente de 1
  ou ambígua não é apagado, evitando modificar a apresentação.
- Falha de CRC, imagem corrompida ou bytes atípicos exigem revisão humana;
  nenhuma técnica de metadados garante anonimização completa.
- O fallback ZIP sem Worker recebe sinal de cancelamento durante a extração,
  em vez de somente após carregar tudo.
- A interface não deve carregar fontes remotas bloqueadas pelo seu próprio
  CSP: foi removido o import Google Fonts. Referências HTTPS legítimas
  **dentro dos livros** continuam preservadas por padrão.
- `upgrade-insecure-requests` permanece no Netlify HTTPS; o navegador
  rodando num servidor local HTTP sem TLS não pode testar essa diretiva.
  Portanto E-062 fica parcial até homologar o servidor final.

**Balanço:** 87 concluídos, 12 parciais, 0 não iniciados no inventário de 99;
todos os 12 parciais preservam seus critérios de conclusão sem atalhos.

## Execução 14: interpretação da qualidade e da auditoria periódica

- E-068: reconstrução de NAV EPUB3 **a partir de NCX válido**, com hierarquia,
  nomes, fragmentos e proteção de caminhos, possui teste diferencial EPUBCheck.
  Se o NCX estiver inconsistente, o reparo não inventa hierarquia editorial.
- E-099: scan OSV v2, SBOM SPDX/CycloneDX e verificação de licenças passam
  em push da dev. A agenda semanal está no código, mas NÃO será executada
  automaticamente enquanto o workflow não estiver na branch padrão `prod`.
- E-031/E-096: histórico antigo de 59s para 12MiB contém custo de transporte
  `Array.from` do Playwright, não pode ser apresentado como throughput da
  aplicação. Medição correta usa File nativo e chegou a 48MiB em 4,920s.
- Escopo concluído automatizado não implica suporte a leitores físicos,
  ausência de malware, nem parecer jurídico de licenças MPL.

**89 concluídos, 10 parciais, 0 pendentes** (E-031, E-032, E-062, E-076,
E-080, E-082, E-089, E-090, E-096, E-098). `prod` preservada.

## Execução 15: orçamento de fronteira com limites explícitos

A fixture 250 MiB descompactados usa três entradas abaixo de 128 MiB e
ficou abaixo dos budgets no Chromium Linux. O teste mede o pipeline real,
sem custos do JSON Playwright, e verifica que o event loop recebe ticks.
E-096 foi concluído **somente no escopo de benchmark automatizado**,
não como promessa para todos os livros, browsers, smartphones ou leitores.
E-031 continua aberto até incluir medição de RSS/Worker e repetição de
múltiplas análises, incluindo dispositivos com RAM limitada.

**Estado atualizado: 90 concluídos, 9 parciais, zero pendentes.**

## Execução 16: filas e Workers no EPUB Repair

- Os ZIPs grandes são **extraídos** em Worker e **recompactados** em
  segundo Worker; bytes originais não são transferidos/detachados na
  recompactação, preservando comparações e auditoria final.
- Cancelamento termina o Worker ativo e descarta Blob tardio. O fallback
  sem Worker não consegue preempção instantânea de JSZip em toda situação.
- Fila FIFO tem oito pendentes por livro, é volátil e não é modo batch.
  Proteger explicitamente downloads gerados contra verificação agendada
  que substituiria o resultado antes da escolha do usuário.
- Porcentagem de ZIP é emitida pelo JSZip real e rotulada como **compactação**;
  progresso de entradas ZIP é independente. Não apresentar porcentagem do
  pipeline inteiro quando ela não é mensurável.
- Memória: RSS real do Chromium no Linux foi medido até 250MiB de conteúdo
  e comparado com budgets de CI; não é teste de hardware iPhone.
- Netlify `prod` ainda declara `worker-src 'none'`; `dev` já usa
  `worker-src 'self'`. Não sincronizar sem revisão/autorização de release.

**93 concluídos / 6 parciais / 0 pendentes** no inventário.

## Execução 17: homologação sem produção

Para validar CSP implantada sem promover `dev`, foi aberto o PR rascunho
#31 com o objetivo exclusivo de gerar um deploy-preview Netlify.
O job de CI verificou headers reais e comportamento de scripts, imagens,
Workers, download e EPUB 12MiB sob HTTPS, com sucesso.
O PR foi fechado **sem merge** e a `prod` permanece v2.2.0.

É correto concluir **E-062** no escopo da versão `dev` em
deploy-preview hospedado. Não significa que produção recebeu
`worker-src 'self'` ou as mudanças de código.

**94 concluídos, 5 parciais, zero pendentes.**

## Execução 18: Kindle Previewer 4 e regras GitHub

- Kindle Previewer **4.0.1 real** converteu EPUB 2/3 reparados e
  NCX hierárquico para KPF; Calibre real importou EPUBs 2/3 e
  extraiu texto. Não alegar visualização GUI, iOS físico ou
  Kindle de hardware apenas com sucesso do conversor.
- A revisão E-098 examinou a **ruleset ativa de prod** e
  implantou gate de auditoria. Não ativou proteção na dev,
  preservando commits diretos. Não afirmar tags imutáveis:
  somente o caminho de release automático é restrito por
  branch, CI, versão e SHA.
- Ainda são necessários os testes de GUI Calibre, Safari/iOS
  real e dispositivos móveis para os itens restantes.

**96 concluídos, 3 parciais, 0 pendentes.**

## Execução 19: critério visual e limitações

E-076 passou no aplicativo gráfico Calibre 7.6 real, com EPUB
reflowable e EPUB fixed-layout, imagem SVG, CSS, captura X11
e checagem do número de pixels corretamente renderizados.
Duas CIs independentes aprovaram; EPUBCheck também passa.
A cobertura **não certifica** aparência no Apple Books/Kindle
nem fontes externas de livros arbitrários.

Saldo **97 concluídos / 2 parciais / 0 pendentes**.
As pendências E-082 e E-089 exigem dispositivo físico e navegador
móvel nativo; emulação não equivale a homologação física.
