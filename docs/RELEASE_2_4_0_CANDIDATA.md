# Candidata EPUB Repair v2.4.0: checklist de homologação e promoção

**Estado inicial:** preparada em `dev`, **não homologada / NÃO MERGEAR**.
Produção atual: `v2.3.0`. Branch de release: `dev`.
O número de versão em `package.json` e nos dois campos de raiz de
`package-lock.json` deve ser `2.4.0`; notas em
`.github/release-notes/v2.4.0.md`.

## Preparação encerrada antes da homologação

- Código e testes de estabilização presentes apenas em `dev`.
- Caso reproduzido por homologação com EPUB 2 privado: normalização
  de idioma cria `CONTENT_LANGUAGE_CONFLICT` em página de rosto com
  `xml:lang` próprio. Corrigido no motor, com regressões sintéticas
  para páginas em idiomas diferentes, `&nbsp;` e sequência
  troca de capa → reparo.
- Correção adicional: troca de capa EPUB 2 não deve introduzir
  `properties="cover-image"` no manifest. EPUB 3 mantém a propriedade.
- O livro privado do usuário **não integra** o repositório ou fixtures de CI.
- Histórico `prod` reconciliado em `dev` sem copiar regressões.
- Versão e notas de release sincronizadas; documentação de CI e
  de testes físicos atualizada.
- Dependabot #34 (Vite patch), #35 (Vitest 5 major) e
  #36 (jsdom 31 major) **fora do escopo**. Permanecem PRs separadas:
  não são correções obrigatórias identificadas nesta candidata,
  e migrar Vitest exigiria alinhar `@vitest/coverage-v8` hoje fixado
  em 4.1.12 no workflow. jsdom 31 altera integração de canvas.
- PR para `prod` deve permanecer **draft** enquanto só há
  CI rápida de `dev`. Sem tag nem publicação antecipada.

## Resultado adicional de EPUB real e regressões Windows

Um EPUB 2 privado, analisado localmente pelo responsável e comparado
independentemente após reparo, preservou o conteúdo dos **8 XHTML**,
NCX, spine, IDs e referências internas; 395 entidades `&nbsp;` foram
normalizadas sem mudança no texto extraído. A capa foi substituída
intencionalmente; outras duas imagens ficaram idênticas em bytes.
Nenhum arquivo ou trecho do livro integra o repositório.

Os testes do usuário em Windows revelaram duas limitações **dos testes**, e
não prova de defeito no EPUB reparado: caminho com `?` inválido no NTFS
e comparação literal de LF/CRLF. Corrigidos com fixture portátil,
mock de scanner executado diretamente pelo Node sem shell e
normalização de fim de linha. O score fictício do cartão de topo,
que parecia contradizer o relatório, agora fica identificado como
ilustrativo e acompanha métricas reais após upload.

**A CI Node 22 é Linux**. A aprovação dessa CI não certifica o resultado
de `npm test` no Windows: é preciso obter execução Windows sem falhas
para encerrar essa diferença de ambiente. O EPUBCheck oficial e Calibre
continuam na matriz de release, não são substituídos por nossa
comparação estrutural independente.

## Ajuste de pontuação após homologação

Um EPUB real revalidado ficou com 0 avisos, 0 erros, 0 reparos e 0 otimizações, porém score 99 porque `CONTENT_INLINE_SVG_LABEL_MISSING` era uma nota `INFO` não corrigível. Ajustado o cálculo para **não penalizar notas meramente informativas**, preservando a exibição do diagnóstico e o desconto por otimização opcional. Testes sintéticos cobrem a nota do SVG, aviso reparável e JPEG opcional. A pontuação é heurística e não certificação externa.

## Somente homologação pendente

As verificações seguintes devem ser executadas **no SHA exato da
candidata**, depois de colocá-la em **Ready for review** ou por
execução manual intencional:

- [ ] `Quality gate / Node 20.x` e `Quality gate / Node 22.x`
  concluídos com sucesso no HEAD da PR.
- [ ] `EPUBCheck 5.4.0 / EPUB reparado` aprovado, incluindo
  EPUB 2, EPUB 3, perfis de navegação e variantes OCF.
- [ ] Matriz `browser-matrix.yml` aprovada em Chromium, Firefox
  e WebKit: upload, inspeção, reparo, download e Workers,
  incluindo EPUB 12 MiB e viewport móvel.
- [ ] Calibre real `calibre-reader.yml` aprovado: importação,
  conversão de texto, navegação e GUI reflowable/fixed-layout.
- [ ] Cobertura `coverage.yml` aprovada em módulos críticos.
- [ ] Prévia Netlify HTTPS `netlify-live-preview.yml` da PR
  aprovada com CSP, `worker-src 'self'`, processamento local e
  download, verificando que o deploy corresponde à candidata.
- [ ] Supply-chain, licenças, npm audit e versões/lockfile
  verificados. Alertas devem ser triados, não ocultados.
- [ ] Inspecionar alterações do PR, sem regressão estrutural
  relevante, e registrar duas revisões finais sem defeitos
  de alta/média prioridade conhecidos; se houver falha, retornar
  ao desenvolvimento e reiniciar os gates afetados.
- [ ] Executar/registrar os testes de compatibilidade nativa
  apropriados (Android, iOS Simulator, Kindle), explicitando
  quando um runner não representa hardware físico.
- [ ] **E-082:** validar Safari/iPhone ou iPad físico com EPUB
  baixado, tamanho/hash, abertura em Apple Books e evidência.
- [ ] **E-089:** validar Android físico (Chrome/Firefox) e
  Safari/iOS físico, incluindo upload, acessibilidade, reparo,
  download, texto, imagens e índices.
- [ ] Revisar riscos/limitações remanescentes e obter
  **autorização explícita** antes do merge em `prod`.

**Regra de decisão:** nenhuma CI verde isoladamente autoriza merge.
Quando um gate estiver indisponível, registrar **pendente ou
limitado**, sem marcar como aprovado. As limitações E-082/E-089
não são tarefas de programação que possam ser concluídas sem
aparelhos físicos.

## Promoção futura (não executada nesta preparação)

1. Conferir que o SHA `dev` ainda é exatamente o homologado.
2. Concluir a revisão da PR e permitir o merge `dev` → `prod`
   somente após autorização explícita do responsável.
3. Após push em `prod`, acompanhar CI de produção e workflow
   `release.yml`: ele só publica `v2.4.0` quando Node
   e demais pré-condições da CI são satisfeitas e o commit
   validado continua no HEAD da produção.
4. Verificar deploy Netlify real e release/tag depois da publicação,
   registrando incidentes e possível rollback se necessário.

## Escopo explicitamente fora desta release

- Evolução voluntária do toolchain Dependabot #34, #35 e #36.
- Funcionalidades novas sem requisito ou bug comprovado.
- Alegação de suporte universal a e-readers ou scanner antivírus.

Referências: [CI econômica](CI_ECONOMICO.md),
[homologação física](HOMOLOGACAO_MOBILE_REAL.md),
[política de branch](BRANCH_TAG_POLICY.md) e
[auditoria histórica](AUDITORIA_99_PROGRESSO.md).
