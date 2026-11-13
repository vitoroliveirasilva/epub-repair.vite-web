# EPUB Repair v4.0.0 — desenvolvimento exclusivo na dev

**Estado: candidata em desenvolvimento.** Este arquivo descreve as funcionalidades iniciais de v4.0.0 implantadas em `dev`. `prod` permanece na release oficial `v3.0.0` até autorização expressa para promoção. Não criar tag nem release neste estágio.

## Princípios de experiência

- O fluxo principal de enviar, verificar, reparar e baixar EPUB permanece inalterado.
- As ferramentas extras ficam recolhidas por padrão, abaixo da experiência principal; não há etapas obrigatórias nem alteração do arquivo sem intenção do usuário.
- O revisor PDF permanece recolhido e não modifica o texto automaticamente.
- Arquivos EPUB/PDF, resultados e relatórios continuam processados localmente no navegador.
- Ações que modificam metadados solicitam confirmação, geram nova cópia e fazem validação posterior. Falhas preservam o original.

## Funcionalidades implementadas na primeira iteração

| Recurso | Experiência disponível | Limites atuais |
| --- | --- | --- |
| Pré-visualizador EPUB | Leitura local com navegação por até 240 capítulos dentro de limites globais de memória, estilo visual aproximado com propriedades CSS permitidas, imagens locais também dentro de tabelas, tabelas com cabeçalhos/fusões, notas recolhíveis no mesmo arquivo e entre capítulos, listas e tipografia básica | Não executa CSS original, scripts ou recursos remotos: só extrai propriedades estritamente permitidas (alinhamento, fonte genérica, recuo, tamanho, peso, itálico, altura de linha e margens). Não reproduz SVG, fontes incorporadas, multimídia ou fixed-layout em nível de pixel. Tabelas enormes e livros acima dos limites informam omissões |
| Comparação antes/depois | Painéis estruturados lado a lado, rolagem proporcional sincronizável, texto, títulos, tabelas, notas, marcação tipográfica, imagens dentro e fora de tabelas, assinatura de CSS/classes e destaque textual sob demanda. Os painéis aplicam a mesma aproximação visual segura do leitor | O CSS original não é executado: mudanças podem ser identificadas sem impacto visual, e efeitos de fontes incorporadas, CSS avançado, SVG, layout fixo e paginação não são comprovados. Amostras longas são limitadas e alinhamento por título só acontece quando único |
| Revisor inteligente de PDF | Auditoria heurística completa com prioridade, evidências, confiança de OCR, colunas/tabelas, cobertura textual e figuras não vinculadas, filtros, marcação manual de conferência e exportação JSON de todos os alertas. A interface limita a 60 itens e informa o total efetivo, evitando ocultar pendências | Não é IA nem diagnóstico conclusivo. Conferência editorial de PDFs reais, tabelas complexas e OCR continua necessária. Nenhuma mudança automática é aplicada, exceto normalização de espaços explicitamente confirmada |
| Processamento em lote | O upload principal aceita um EPUB no fluxo individual ou vários EPUBs, abrindo o lote automaticamente. Na ferramenta Em lote, um ou vários arquivos podem ser adicionados por arrastar e soltar ou seleção, removidos individualmente e processados no modo **Somente verificar** (relatórios sem alterar livros) ou **Corrigir e melhorar todos** (reparo estrutural obrigatório, depois otimizações opcionais elegíveis). Gera um ZIP com EPUBs resultantes quando solicitado, relatórios completos por arquivo, resumo global, status de alterações reais e progresso por etapa | No máximo seis EPUBs/80 MB de entrada e 160 MB de saída armazenada em memória. Não são aplicadas correções perigosas ou impossíveis; arquivos com pendências recebem relatório de revisão manual. Livros inválidos e erros isolados não bloqueiam os demais. Não há pausa/retomada nem garantia de reparo universal |
| Editor de metadados | Edição validada de título, autor principal, autores adicionais, funções MARC opcionais, idioma, identificador primário, editora, data, descrição, assunto, série e volume. Reorganiza autores mantendo os IDs e refinamentos por nome, não elimina autor vinculado sem avisar; preserva identificadores secundários, funções EPUB 2/3, a posição da coleção correta e UID do NCX. Mantém rascunhos e salva nova cópia validada | Editor conservador: exclui créditos apenas quando não há vínculo protegido. Não manipula livremente todos os refinamentos arbitrários e outros esquemas de metadados. Campos vazios preservam os valores existentes; EPUBs assinados são recusados |
| Preparar para Kindle | Checklist local de dez dimensões: estrutura, metadados, capa, navegação, recursos, conteúdo ativo/DRM, tamanho para envio web, acessibilidade, layout/formato especial e alertas residuais. Identifica bloqueios e recomenda ações. Permite exportação JSON com verificações detalhadas e link oficial de envio | Orientativo, não certifica aceitação ou aparência no Kindle. O limite oficial do envio web é 200 MB, mas envio por e-mail possui outras regras. Nenhum upload, conversão para AZW ou remoção de DRM é realizado |

## Reconstrução PDF com duas colunas e ilustrações

- Fragmentos de texto que compartilham a mesma altura no PDF, mas estão separados por uma distância horizontal representativa, são mantidos como linhas distintas em vez de fundidos.
- A ordem de leitura agrupa primeiro a coluna esquerda e depois a direita em cada faixa; elementos que atravessam quase toda a largura dividem as faixas. Transições de coluna encerram o parágrafo anterior.
- Ilustrações em páginas de duas colunas são inseridas de acordo com a coluna e posição vertical, sem depender exclusivamente da coordenada Y geral da página.
- O revisor PDF identifica possíveis grades tabulares com três ou mais colunas por linha em pelo menos três linhas. A detecção é apenas indicativa: o conversor ainda não gera HTML semântico de tabelas e o usuário deve conferir o resultado ou selecionar layout fixo.
- Os novos testes reproduzem páginas sintéticas com colunas alinhadas horizontalmente, títulos intermediários de largura total, figuras na coluna direita, livro de uma coluna e diferenciação entre tabela e texto em duas colunas.
- Ainda é necessária homologação com PDFs autorizados do mundo real, especialmente tabelas irregulares, páginas com mudanças complexas de colunas, figuras flutuantes e notas. O modo reflowable não garante correspondência perfeita de paginação.

## Critérios para considerar v4.0.0 pronta para lançamento

1. CI de `dev` aprovada em Node 22, incluindo typecheck, lint, Vitest, build e auditoria.
2. Testes de regressão por feature com EPUB 2/3, referências inválidas, XML adversarial, livros grandes, mobile e acessibilidade. A suíte sintética de leitor/mídia/metadados é uma primeira camada, não substitui a homologação.
3. Comparação visual com amostras autorizadas, incluindo EPUB reparado e livro com ilustrações. O diff de palavras atualmente é opcional, limitado por quantidade de termos e não substitui comparação tipográfica.
4. Comportamento reflowable/fixed-layout explicitamente separado do modo texto, sem apresentar a prévia simplificada como visualização fiel.
5. Confirmar preservação de metadados OPF/NCX/NAV e ausência de problemas introduzidos pela edição, incluindo autoria múltipla com refinamentos no EPUB 2/3.
6. Medir memória, tempo, cancelamento e progressão da fila em lote em aparelhos modestos.
7. Conferência manual da revisão PDF, incluindo falsos positivos e valores de OCR.
8. Somente após aprovação explícita do responsável, abrir PR `dev` → `prod`, executar checks exigidos, efetuar merge e publicar `v4.0.0` pelo workflow existente.

## Operação e segurança

O recurso Kindle apenas abre `https://www.amazon.com/sendtokindle` em outra aba. Nenhum upload automático é feito. O serviço oficial aceita EPUB para upload web de até 200 MB, mas o limite e as regras do provedor podem mudar. A aplicação não remove DRM nem valida direitos autorais.

O painel de visualização não executa scripts do EPUB, e seu conteúdo é exibido como texto, não HTML não confiável. A comparação textual pode indicar diferença sem explicar a sua causa editorial, e não substitui validação final no dispositivo.

Manter documentação histórica e notas v3 intactas. Não rodar suites pesadas manualmente para cada pequeno ajuste; consolidar correções na `dev`.

## Melhorias de segurança e usabilidade desta rodada

- **Rascunho de metadados:** editar, trocar de ferramenta e voltar não perde mudanças. Recarregar do EPUB ou descartar alterações exige confirmação quando há campos editados. O botão de gerar nova cópia fica desabilitado se não há alterações efetivas. Um valor apagado (vazio) preserva o campo original.
- **Prévia sem HTML bruto:** estilos tipográficos simples do XHTML são reconstruídos a partir de trechos estruturados com limites de tamanho e profundidade. O navegador recebe apenas elementos criados pela aplicação. Links e scripts contidos no EPUB não se tornam elementos executáveis na prévia.
- **Navegação de capítulos:** há controles de anterior/próximo além do seletor existente. A fonte é ajustada no próprio painel, sem afetar comparações ou outros leitores na página.
- **Limites editoriais:** estes recursos são aproximações visuais para revisão. Não substituem um motor de layout completo, Kindle Previewer ou testes reais de navegadores e dispositivos.

## Rodada de revisão PDF e Kindle

- O revisor ordena os pontos por prioridade alta, média ou baixa e informa a página e a seção quando identificadas. Mostra trecho de referência, mas não remove conteúdo por conta própria.
- O tratamento de espaços foi restringido aos segmentos de texto do HTML. Atributos, tags, imagens, blocos `pre`/`code` e o PDF original são preservados. Um novo EPUB só é gerado após a confirmação normal do fluxo.
- O alerta de página sem vínculo não afirma perda de texto: pode indicar sumário ou navegação técnica descartada intencionalmente. Deve ser conferido pelo usuário.
- O checklist Kindle organiza oito categorias e orienta a próxima ação para pendências. Sem validação em dispositivo físico ou no serviço externo, não se declara compatibilidade certificada.
- A documentação e os testes sintéticos não substituem EPUBCheck, amostras reais e homologação em navegadores/dispositivos.

## Fidelidade PDF: cabeçalhos, numeração e ilustrações sem texto

- Fragmentos curtos distantes na mesma linha do PDF deixam de ser unidos por causa do tamanho pequeno do texto. A reconstrução os conserva como linhas independentes para reduzir a mistura de células, colunas e números.
- A detecção de cabeçalhos e rodapés recorrentes compara posição superior e inferior separadamente. O mesmo texto em posições alternadas não é automaticamente tratado como repetição.
- Padrões de capítulos numerados e títulos editoriais são preservados mesmo quando aparecem repetidamente próximos à borda da página. Isso impede que "CAPÍTULO 1", "CAPÍTULO 2" etc. sejam considerados cabeçalhos duplicados apenas por normalização de dígitos.
- Quando uma página fica sem linhas textuais após o filtro de numeração, ilustrações recuperadas continuam sendo incluídas na reconstrução, e seus recursos entram no XHTML e no manifesto do EPUB.
- Cinco casos novos de regressão cobrem fragmentos curtos lado a lado, capítulos numerados, margens alternadas, páginas com apenas imagem após filtro e uma verificação EPUB final por ZIP, pacote e validação.
- São correções conservadoras e não constituem equivalência visual com o PDF: preservar o layout de tabelas complexas continua exigindo conferência manual ou layout fixo.

## Auditoria de integridade pós-conversão (reflowable)

- Após gerar e aplicar o acabamento automático, uma segunda verificação abre o EPUB final e confere a quantidade e a ordem de capítulos no spine, entradas no manifesto, XHTML válido e a permanência do texto presente no HTML editado.
- O texto é comparado ignorando diferenças de espaços e compatibilização Unicode; a auditoria evita falsos bloqueios por reflow, mas não é uma comparação de layout, estilo ou fidelidade com todo o conteúdo do PDF original.
- O verificador exige que cada imagem presente no HTML de entrada continue referenciada e que cada figura/página visual incorporada tenha imagem disponível e declarada no manifesto. Se encontrar perda objetiva, o EPUB não é disponibilizado e o erro é mostrado ao usuário.
- Páginas visuais que têm texto editado não recuperam nem sobrescrevem automaticamente o texto original reconhecido no PDF. Isso também vale para edição pelo campo de texto simples, que pode remover os marcadores de página.
- Se a página visual estiver sem marcador e seu texto ainda estiver no capítulo, a transcrição não é duplicada. Se não houver texto editado ou transcrição, a figura preservada recebe descrição alternativa.
- Quando uma página textual apresenta várias linhas relevantes e quase nenhuma está no texto editável, o revisor sugere uma conferência manual. É uma heurística: reordenação, limpeza e edições deliberadas podem justificar diferenças. Não há bloqueio automático nesse caso.
- O resultado de um EPUB de texto ajustável informa quantas seções e referências de imagem passaram pela auditoria interna. Para layout fixo a auditoria textual não se aplica; prevalecem a validação estrutural e a renderização por página.
- A implementação inclui regressões para perda de caracteres, imagens ausentes, capítulo retirado do spine, textos editados e visualizações preservadas, além de teste de cancelamento.
- **Limite importante:** o processo verifica a integridade entre o conteúdo editado e o EPUB final, não garante extração perfeita do PDF. Homologação com obras reais e EPUBCheck permanecem pendentes.

## Fechamento técnico focado: leitor e comparador (v4)

- O leitor transforma XHTML local em elementos seguros gerados pela aplicação, mantendo tabelas com cabeçalhos `th`, linhas, células mescladas e conteúdo tipográfico básico. Tabelas grandes são limitadas a 70 linhas, 14 células por linha e 450 células no total; a interface informa truncamentos.
- Notas de rodapé e de fim reconhecidas por semântica EPUB/ARIA são exibidas recolhidas. Referências `#id` locais permitem abrir a nota; endereços externos, scripts e links inseguros não são ativados.
- Imagens raster locais incluídas dentro de tabelas continuam visíveis na prévia, separadamente, sujeitas a 20 imagens e orçamento de 8 MB; SVG e mídia interativa não são reproduzidos.
- Para EPUB de layout fixo, a prévia informa que o desenho visual é simplificado. Não promete diagramação igual à de um e-reader; as imagens incluídas nas páginas podem ser inspecionadas com segurança.
- A comparação agora verifica estrutura de blocos, organização/células de tabelas, funções das notas, formatação em linha e imagens além do texto. Alterações em CSS interno, CSS local e classes/estilos declarados são identificadas por assinatura limitada sem executar o código estilístico.
- O resumo de diferenças indica múltiplos aspectos afetados e a limitação da conferência de CSS. Controles extras permanecem ocultos até abertura do painel opcional, sem poluir o fluxo principal.
- **Critério de honestidade:** o leitor e o comparador estão funcionalmente mais completos, mas não se deve afirmar 100% de fidelidade visual, especialmente em CSS complexo, EPUB fixed-layout, tabelas grandes, notas entre arquivos, páginas SVG ou dispositivos Kindle físicos. A homologação com EPUBs reais ainda é necessária antes de marcar a entrega como pronta para publicação.

## Critérios de encerramento funcional do leitor e comparador

- **Leitor:** a visualização de EPUB de texto ajustável agora reconstitui estrutura editorial, tabelas limitadas, imagens dentro das células, notas com referências locais/entre capítulos, estilos seguros aproximados e navegação de até 240 seções, limitada ainda por 20 MiB de XHTML e 12 mil blocos. Quando esses limites forem atingidos, exibe quantidade omitida. Nenhum HTML ou CSS arbitrário é montado no DOM.
- **Segurança dos estilos:** regras de CSS são analisadas como texto, em no máximo 180 kB e 120 seletores simples, e apenas atributos tipados permitidos são aplicados. Não são interpretados `url()`, `@import`, posições fixas, scripts, fontes incorporadas, cores arbitrárias ou links externos.
- **Comparador:** a prévia estruturada de duas versões aplica o mesmo conjunto de estilos seguros; há rolagem proporcional opcional, comparação de imagem inclusive dentro de tabela, comparação de tipografia, blocos e mudanças em declarações CSS. O resumo aponta a natureza da diferença e os limites da amostragem.
- **Fronteira do 100%:** o escopo de ferramenta editorial segura pode ser considerado implementado após testes locais e da CI. Reprodução pixel a pixel, layout fixo completo, suporte irrestrito a SVG, fontes personalizadas, regras CSS amplas e teste físico Kindle são atividades separadas de homologação/um motor de leitura completo e **não devem ser chamados de concluídos**.
- **Validação restante:** testes automatizados não substituem avaliação no navegador real com EPUBs autorizados. A validação visual manual e compatibilidade de dispositivos continuam pendentes.

## Encerramento técnico da revisão PDF e do processamento em lote (v4)

- **Revisor PDF:** coleta todos os achados heurísticos, com contagens corretas por prioridade. A interface mostra até 60 alertas com aviso explícito dos demais; exportação JSON contém a lista completa e o estado de conferência manual. Inclui revisão de figuras extraídas sem referência nas seções editáveis.
- **Tratamento de falsos positivos:** quando uma seção está vinculada a múltiplas páginas sem marcadores confiáveis, a verificação textual não acusa ausência com base no conteúdo integral da seção, evitando confundir ordenação com perda. Alertas permanecem sugestões e o usuário decide se confirma um ajuste.
- **Andamento do lote:** leitura, validação, reparo, empacotamento e finalização por arquivo. Os estados são registrados na interface e em `relatorios/arquivo-NN.json`; a recusa/falha de um item não bloqueia os seguintes. A operação retorna apenas o arquivo ZIP completo, nunca um parcial.
- **Integridade de lote:** arquivos EPUB de saída são adicionados somente após avaliação final de validade e ausência de erros fatais. Se restarem erros, avisos ou ações pendentes, o resultado será classificado para revisão manual, não como livro perfeitamente corrigido.
- **Relatórios:** ZIP contém `resultado-lote.txt`, `resultado-lote.json` com contagens e relatórios JSON individuais com estatísticas, avisos, ações aplicadas e até 120 ocorrências por etapa.
- **Limites:** máximo de seis arquivos/80 MB de entrada, armazenamento somado de até 160 MB de EPUBs gerados em memória. Não há fila persistente, pausa/resume ou promessa de compatibilidade com todo dispositivo.
- **Condição de publicação:** implementação funcional pode ser encerrada após os testes automatizados; homologação manual com arquivos reais, EPUBCheck aplicável e testes de desempenho/cancelamento em celulares continuam obrigatórios antes de lançar a v4.

## Encerramento técnico do editor de metadados e checklist Kindle (v4)

- O editor de créditos preserva IDs de criadores ao mudar sua ordem. Os respectivos refinamentos `role`, `file-as` e outras associações `refines="#id"` acompanham o autor correto. Excluir ou substituir silenciosamente um crédito refinado é bloqueado, preservando o arquivo original.
- Os papéis MARC podem ser editados em campo opcional com códigos alfabéticos de três letras. As linhas devem corresponder à ordem dos autores adicionais; campos vazios mantêm papéis existentes. No EPUB 2, os valores são escritos em `opf:role`. No EPUB 3, são vinculados por `meta property="role" refines="#id"`, com esquema `marc:relators`.
- O volume em coleções EPUB 3 é lido e alterado pelo `group-position` relacionado à coleção selecionada, sem sequestrar o refinamento de outra coleção. IDs de metadados novos evitam colisões. Identificadores secundários e o UID do NCX continuam preservados/sincronizados quando necessário.
- O checklist Kindle passa a distinguir dez grupos, incluindo acessibilidade e layout. Detecta pacote/spine ausente, entradas DRM/criptografia, recursos quebrados, metadados, capa e tamanho. Os estados `ready`, `review`, `blocked` representam observações locais, não a aprovação do serviço.
- O JSON baixável da análise Kindle contém o resumo e a ação sugerida para cada verificação. Nenhum arquivo é transmitido ao serviço pela aplicação.
- O limite de 200 MB corresponde ao Send to Kindle **pela web** e foi conferido nas orientações oficiais da Amazon. O fluxo de e-mail tem limites próprios e a Amazon pode mudar requisitos.
- **Escopo funcional concluído, publicação pendente:** não se promete compatibilidade certificada sem enviar EPUBs autorizados e testar em aplicativo/e-reader. A edição não suporta alterações arbitrárias de todos os vocabulários de metadados ou remover DRM.

## Upload único ou múltiplo e reparo em lote opt-in

- O upload principal preserva a experiência de um arquivo: um EPUB segue a verificação e o reparo individual. Dois ou mais arquivos abrem automaticamente `Ferramentas extras > Em lote`, com a seleção pronta para processamento.
- O painel de lote aceita um ou vários arquivos por clique, teclado ou arrastando para a área de seleção. É possível adicionar arquivos em rodadas sucessivas e remover um item sem perder os outros. Arquivos não EPUB e vazios são ignorados na seleção, e os limites do lote são aplicados antes do processamento.
- O modo padrão é **Corrigir e melhorar todos**: em cada EPUB elegível o sistema usa o mesmo motor de reparo da tela individual e, quando aplicável, executa também a etapa de melhorias opcionais de compatibilidade, sempre com validação depois de cada alteração.
- **Somente verificar** é escolha explícita: apenas gera relatórios JSON individuais e resumo TXT/JSON. Não coloca livros originais no ZIP de relatórios e não executa reparos.
- Os arquivos que foram alterados de fato recebem `changed=true` e contadores de reparos/otimizações no relatório. Se restarem avisos, o status pode ser `revisão manual` mesmo após melhorias reais; o relatório e a interface mostram quantas foram aplicadas.
- Falhas de otimização opcional não devem invalidar um EPUB já corrigido: o sistema preserva o último resultado verificado e registra a falha como alerta. Arquivos assinados, protegidos ou irrecuperáveis não têm proteções removidas.
- O ZIP contém livros de saída no modo de correção, `resultado-lote.txt`, `resultado-lote.json` e `relatorios/arquivo-NN.json` para cada EPUB, incluindo recusados. Os originais permanecem no computador do usuário.
- O processamento é cancelável e nunca disponibiliza ZIP parcial. Permanecem as limitações de processamento local, seis arquivos e 80 MB de entrada.
