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
| Pré-visualizador EPUB | Leitura por capítulo com navegação anterior/próximo, ajuste de fonte, negrito, itálico, sobrescrito, subscrito, código, quebras de linha, listas, citações e imagens rasterizadas internas (PNG/JPEG/GIF/WebP) | Não executa HTML/CSS, scripts ou links externos. A apresentação não reproduz a tipografia, links interativos, notas avançadas ou fixed-layout do leitor real. Há limites de imagens e memória |
| Comparação antes/depois | Painéis de capítulos/imagens lado a lado, alinhamento pelo caminho do spine ou título único, indicação de seções novas/removidas e destaque opcional de palavras inseridas/removidas por LCS limitado | Trechos longos têm amostragem explicitamente sinalizada. Não compara CSS, fontes nem paginação. Títulos duplicados não são alinhados por aproximação |
| Revisor inteligente de PDF | Revisão heurística priorizada, com estimativa de confiança de OCR, trechos de evidência, alerta de página não vinculada, colunas, imagens, hifenização e espaços; as primeiras 6 sugestões ficam visíveis e as demais podem ser expandidas. A normalização de espaços mantém HTML, imagens, atributos e formatação da seção | Não é IA nem diagnóstico conclusivo: revisão editorial manual permanece necessária. A heurística de página sem vínculo pode apontar sumários técnicos removidos intencionalmente. A conversão de imagens e tabelas ainda precisa de testes reais |
| Processamento em lote | Até seis EPUBs/80 MB, processamento sequencial isolado por arquivo, nomes únicos independentemente de maiúsculas/minúsculas, ZIP e relatório TXT por arquivo, cancelamento antes de publicar | Lotes maiores, pausa/resume e validação em celulares físicos ainda não são suportados; documentos com erros podem ser recusados individualmente |
| Editor de metadados | Edição opcional de título, autor principal, outros créditos (até 12 linhas), idioma, identificador principal, editora, data, descrição, assunto e série. O formulário mantém um rascunho local entre abas, só envia campos efetivamente alterados, permite descartar e não apaga a cópia exportada antes de uma nova edição. Mantém IDs, funções e refinamentos existentes, preserva identificadores secundários e sincroniza UID do NCX quando aplicável | Edição de funções MARC, múltiplos identificadores, refinamentos complexos e exclusão de crédito refinado continuam bloqueadas/pendentes. Campos vazios preservam informações; EPUB assinado é bloqueado |
| Preparar para Kindle | Checklist local com oito verificações: estrutura, metadados, capa, navegação, arquivos internos, conteúdo remoto/ativo, tamanho e alertas gerais. Diferencia bloqueios de conferências e orienta como agir; link para Send to Kindle | Verificação indicativa, não valida aceitação pela Amazon nem a aparência no dispositivo. Limite de 200 MB apenas como referência sujeita a mudança. Não realiza envio, remoção de DRM ou conversão para AZW |

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
