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
| Pré-visualizador EPUB | Leitura por seção/spine com capítulos, parágrafos, listas, citações e imagens internas rasterizadas (PNG/JPEG/GIF/WebP), com ajuste da fonte | Não executa HTML/CSS, scripts ou links externos. A apresentação não reproduz a tipografia, links interativos, notas avançadas ou fixed-layout do leitor real. Há limites de imagens e memória |
| Comparação antes/depois | Painéis de capítulos e imagens internas lado a lado, alinhados pelo caminho no spine, com indicação de texto alterado e seções novas/removidas | A contagem de palavras usa prefixo/sufixo, não diff editorial completo. Caminhos alterados usam título/posição apenas como aproximação; não compara CSS, fontes e paginação |
| Revisor inteligente de PDF | Sugestões heurísticas de OCR de baixa confiança, colunas, fallback visual, caracteres estranhos, espaços e hifenização; navegação para revisão; normalização manual de espaços com confirmação | Não há modelo de IA, classificação universal de erros nem correções sem aprovação |
| Processamento em lote | Até seis EPUBs/80 MB, processamento sequencial isolado por arquivo, nomes únicos independentemente de maiúsculas/minúsculas, ZIP e relatório TXT por arquivo, cancelamento antes de publicar | Lotes maiores, pausa/resume e validação em celulares físicos ainda não são suportados; documentos com erros podem ser recusados individualmente |
| Editor de metadados | Edição sob demanda de título, autor principal, idioma, identificador principal correto, editora, data, descrição, assunto e série; evita regravação sem alterações e preserva identificadores secundários | Metadados de autores múltiplos, funções e refinamentos complexos exigem revisão; EPUB assinado é bloqueado. A alteração de identificador sincroniza UID do NCX quando correspondente |
| Preparar para Kindle | Checklist de estrutura, capa, navegação, tamanho e alertas; link para o Send to Kindle oficial | Verificação indicativa, não valida comportamento real de Send to Kindle, dispositivo ou conversor Amazon |

## Critérios para considerar v4.0.0 pronta para lançamento

1. CI de `dev` aprovada em Node 22, incluindo typecheck, lint, Vitest, build e auditoria.
2. Testes de regressão por feature com EPUB 2/3, referências inválidas, XML adversarial, livros grandes, mobile e acessibilidade. A suíte sintética de leitor/mídia/metadados é uma primeira camada, não substitui a homologação.
3. Comparação visual com amostras autorizadas, incluindo EPUB reparado e livro com ilustrações.
4. Comportamento reflowable/fixed-layout explicitamente separado do modo texto, sem apresentar a prévia simplificada como visualização fiel.
5. Confirmar preservação de metadados OPF/NCX/NAV e ausência de problemas introduzidos pela edição.
6. Medir memória, tempo, cancelamento e progressão da fila em lote em aparelhos modestos.
7. Conferência manual da revisão PDF, incluindo falsos positivos e valores de OCR.
8. Somente após aprovação explícita do responsável, abrir PR `dev` → `prod`, executar checks exigidos, efetuar merge e publicar `v4.0.0` pelo workflow existente.

## Operação e segurança

O recurso Kindle apenas abre `https://www.amazon.com/sendtokindle` em outra aba. Nenhum upload automático é feito. O serviço oficial aceita EPUB para upload web de até 200 MB, mas o limite e as regras do provedor podem mudar. A aplicação não remove DRM nem valida direitos autorais.

O painel de visualização não executa scripts do EPUB, e seu conteúdo é exibido como texto, não HTML não confiável. A comparação textual pode indicar diferença sem explicar a sua causa editorial, e não substitui validação final no dispositivo.

Manter documentação histórica e notas v3 intactas. Não rodar suites pesadas manualmente para cada pequeno ajuste; consolidar correções na `dev`.
