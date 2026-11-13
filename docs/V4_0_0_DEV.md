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
| Pré-visualizador EPUB | Leitura local por capítulo com navegação e fonte ajustável, formatação sem HTML ativo, imagens internas, tabelas estruturadas com cabeçalhos e fusões de células, notas recolhíveis com referências internas e listas numeradas; suporte orientativo a EPUB de layout fixo | Usa estilos próprios e não executa o CSS, scripts ou recursos externos do livro. Tabelas enormes são truncadas, notas e links entre arquivos têm suporte limitado, SVG e layouts exóticos não são reproduzidos fielmente. Mídia é sujeita a limites de imagem/memória |
| Comparação antes/depois | Painéis estruturados lado a lado, capítulos alinhados por caminho ou título único, status de texto/imagens, estrutura de títulos/tabelas/notas, formatação em linha e mudanças em arquivos CSS ou classes; diferenças de palavras sob demanda | CSS é comparado por assinatura de arquivos/declaracões sem renderização: detecta mudança, não demonstra efeito visual. Paginação, fontes e pixels não são comparados. Amostras longas são reduzidas; títulos duplicados não usam pareamento especulativo |
| Revisor inteligente de PDF | Revisão heurística priorizada, com estimativa de confiança de OCR, trechos de evidência, alerta de página não vinculada, colunas, imagens, hifenização e espaços; as primeiras 6 sugestões ficam visíveis e as demais podem ser expandidas. A normalização de espaços mantém HTML, imagens, atributos e formatação da seção | Não é IA nem diagnóstico conclusivo: revisão editorial manual permanece necessária. A heurística de página sem vínculo pode apontar sumários técnicos removidos intencionalmente. A conversão de imagens e tabelas ainda precisa de testes reais |
| Processamento em lote | Até seis EPUBs/80 MB, processamento sequencial isolado por arquivo, nomes únicos independentemente de maiúsculas/minúsculas, ZIP e relatório TXT por arquivo, cancelamento antes de publicar | Lotes maiores, pausa/resume e validação em celulares físicos ainda não são suportados; documentos com erros podem ser recusados individualmente |
| Editor de metadados | Edição opcional de título, autor principal, outros créditos (até 12 linhas), idioma, identificador principal, editora, data, descrição, assunto e série. O formulário mantém um rascunho local entre abas, só envia campos efetivamente alterados, permite descartar e não apaga a cópia exportada antes de uma nova edição. Mantém IDs, funções e refinamentos existentes, preserva identificadores secundários e sincroniza UID do NCX quando aplicável | Edição de funções MARC, múltiplos identificadores, refinamentos complexos e exclusão de crédito refinado continuam bloqueadas/pendentes. Campos vazios preservam informações; EPUB assinado é bloqueado |
| Preparar para Kindle | Checklist local com oito verificações: estrutura, metadados, capa, navegação, arquivos internos, conteúdo remoto/ativo, tamanho e alertas gerais. Diferencia bloqueios de conferências e orienta como agir; link para Send to Kindle | Verificação indicativa, não valida aceitação pela Amazon nem a aparência no dispositivo. Limite de 200 MB apenas como referência sujeita a mudança. Não realiza envio, remoção de DRM ou conversão para AZW |

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
