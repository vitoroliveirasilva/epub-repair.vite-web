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
| Pré-visualizador EPUB | Leitura textual por seção/spine e ajuste de tamanho da fonte, sob demanda | Não é leitor de layout fiel: CSS original, mídia, imagens, notas interativas e fixed-layout não são renderizados |
| Comparação antes/depois | Painéis textuais paralelos por seção, para comparar original e arquivo reparado ou cópia com metadados | Associações por índice do spine; não há diff semântico alinhado, comparação tipográfica nem visual de imagens |
| Revisor inteligente de PDF | Sugestões heurísticas de OCR de baixa confiança, colunas, fallback visual, caracteres estranhos, espaços e hifenização; navegação para revisão; normalização manual de espaços com confirmação | Não há modelo de IA, classificação universal de erros nem correções sem aprovação |
| Processamento em lote | Seleção explícita de até seis EPUBs/80 MB, diagnóstico e reparo conservador sequencial, ZIP de resultados e relatório TXT | Lotes grandes, pausa/resume e preservação integral de hierarquia complexa não são suportados |
| Editor de metadados | Edição sob demanda de título, autor principal, idioma, identificador, editora, data, descrição, assunto e dados de série; geração de cópia separada | Metadados avançados de múltiplos autores, funções, refinamentos de coleção e demais identificadores exigem revisão; EPUB assinado é bloqueado |
| Preparar para Kindle | Checklist de estrutura, capa, navegação, tamanho e alertas; link para o Send to Kindle oficial | Verificação indicativa, não valida comportamento real de Send to Kindle, dispositivo ou conversor Amazon |

## Critérios para considerar v4.0.0 pronta para lançamento

1. CI de `dev` aprovada em Node 22, incluindo typecheck, lint, Vitest, build e auditoria.
2. Testes de regressão por feature com EPUB 2/3, referências inválidas, XML adversarial, livros grandes, mobile e acessibilidade.
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
