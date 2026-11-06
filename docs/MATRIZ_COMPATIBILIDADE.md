# Matriz de formatos e validação

A ferramenta tem foco em reparos **conservadores e verificáveis** de EPUB 2 e EPUB 3.
A execução de EPUBCheck no CI valida duas fixtures sintéticas geradas pelo motor (EPUB 2 e 3), não todos os
livros nem todos os recursos possíveis das especificações.

| Perfil / recurso | Leitura no app | Reparos automáticos | Validação externa |
| --- | --- | --- | --- |
| EPUB 2.0/2.0.1 | ZIP, OPF, spine, NCX, imagens, CSS | MIME, container, manifest, NCX ausente quando há destinos válidos | Uma fixture EPUB 2 original/reparada é verificada no EPUBCheck 5.4.0; ampliar corpus |
| EPUB 3.0/3.2 | OPF 3, nav.xhtml, XHTML, fontes e recursos externos | Ajustes estruturais, nav básico quando ausente | Uma fixture EPUB 3 original/reparada passa pela validação diferencial no CI |
| EPUB 3.3 | Funcionalidades básicas | Reparo conservador sem converter a edição | Validar novas regras oficiais caso a caso |
| EPUB 3.4 | Pacote EPUB3 reconhecido; sem suporte completo às novidades | Não presumir cobertura de novos recursos | EPUBCheck 5.4.0 verifica pelas regras EPUB 3.4 |
| Fontes externas HTTP/HTTPS | Permitidas por padrão | Não remover sem solicitação | Leitura offline depende da fonte |
| JPEG progressivo | Diagnóstico opcional | Conversão somente com opt-in de otimização | Depende do navegador |
| Scripts EPUB 3, SMIL, Media Overlays | Diagnóstico parcial | Não prometer restauração de interatividade | Requer testes específicos e manual |
| Fixed-layout, SVG complexo, MathML e RTL | Suporte básico estrutural | Nenhuma transformação editorial implícita | Necessita corpus, EPUBCheck e inspeção visual |
| Kindle/Calibre/leitores móveis | Compatibilidade estimada, não certificada | Técnicas de compatibilidade comuns | Não existe matriz real completa de dispositivos |

## Qualidade comprovada por CI

- `npm ci`, typecheck, lint, testes sintéticos e build em Node.js 20/22.
- EPUBCheck **5.4.0**, obtido do projeto W3C por release com checksum SHA-256.
- Um EPUB2 e um EPUB3 intencionalmente inválidos sem `mimetype` são reparados
  pelo motor e suas cópias resultantes são validadas pelo EPUBCheck.
- A operação idempotente é testada: um segundo reparo sem pendências não altera o EPUB.

## Limites pendentes

- EPUBCheck precisa validar mais fixtures complexas sintetizadas, com EPUB2, foreign resources,
  navegação complexa e mídia sincronizada.
- Chromium, Firefox e WebKit já executam smoke automatizado com screenshots
  antes/depois e conversão real de JPEG progressivo em fixtures sintéticas.
  **Kindle Previewer, Calibre e dispositivos físicos** ainda precisam ser homologados.
- O site estático **não** executa EPUBCheck Java no navegador.
- Conformidade oficial não substitui revisão editorial, teste visual nem antivírus.

Referências:
- https://www.w3.org/TR/epub-33/
- https://www.w3.org/TR/epub-34/
- https://github.com/w3c/epubcheck/releases/tag/v5.4.0

## Complementos da execução 3

| Recurso | Cobertura |
| --- | --- |
| JPEG/PNG/GIF/WebP | Assinatura e dimensões básicas, sem prova de integridade de pixels |
| Imagens sem alt | Avisos em XHTML, sem alterar a obra |
| ZIP sem UTF-8 confiável | Suporte a CP437 com decodificação unificada no ZIP; recusa UTF-8 explícito inválido |
| Ofuscação IDPF | Informada como fonte ofuscada e não confundida com DRM |
| Imagens raster data: | Permitidas nos contextos de imagem; SVG/HTML ativos bloqueados |
| Relatórios técnicos | SHA-256 do EPUB original, versão, opções atuais e snapshot das opções efetivamente aplicadas |

## Complementos da execução 4

- OPF: validações conservadoras de identidade, modified UTC, links refines,
  cover-image/nav e direção de leitura RTL/ltr.
- Navegação EPUB 3: toc, page-list e landmarks validados quanto a duplicação,
  estrutura de lista e semântica de landmarks.
- A CI usa EPUBCheck 5.4.0 antes e depois do reparo com fixtures **EPUB 2 e EPUB 3**,
  mas não demonstra compatibilidade universal em Kindle, Calibre ou navegadores.
- Regras de DTD e XML preservam padrões tradicionais conhecidos e recusam
  construções externas não autorizadas.

## Complementos da execução 6 (branch dev, ainda não lançados)

| Tema | Situação do motor | O que falta homologar |
| --- | --- | --- |
| EPUB 3 fixed-layout | Verifica `rendition:layout`, viewport XHTML e viewBox SVG | Renderização real, viewport de dispositivos e páginas espelhadas |
| Media Overlays/SMIL | Inspeção de XML, texto, fragmentos, áudio e tempos | Sincronia auditiva real, codecs e leitores |
| ZIP com data descriptor | Inspeciona CRC e tamanhos, identifica ZIP64 e multipartes | Corpus adversarial maior e limites de memória em dispositivos modestos |
| CSS e recursos externos | Diagnosticados sem presumir que HTTP/HTTPS são perigosos | Efeitos visuais e disponibilidade offline de fontes remotas |
| Scripts | Inventário declarado/órfão; executáveis e assinaturas binárias inesperadas avisados | Análise profunda ou AV externo; JavaScript legítimo não equivale a malware |
| Comparação antes/depois | Diff de XHTML, CSS, OPF e NCX em UI/TXT/JSON, prévia limitada | Diferença visual real, renderização MathML/ruby e EPUBs grandes |
| Acessibilidade | Retenção de foco e cursor em rerender, status ARIA | Testes de leitor de tela e navegadores reais |
| Idempotência | Testes de propriedades em múltiplas fixtures EPUB 3 | Corpus diverso de EPUB 2/3 reais e performance |
| Capa | Validação cruzada do OPF e páginas de capa no guide/landmarks | Casos de capas animadas, múltiplas renditions e leitores |

Os cenários com indicação de cobertura automática não significam certificação de compatibilidade em leitores reais. O EPUBCheck valida as fixtures sintéticas configuradas no CI.

## Complementos da execução 12

- ZIP legado: suporte a nomes CP437 com testes de caminho/CRC/UTF-8 e prevenção
  de corrupção silenciosa. Essa escolha não converte encodings legados arbitrários.
- Testes de segurança: corpus determinístico e casos adversariais de parser,
  orçamento limitado para inputs degenerados, sem promessa anti-ReDoS universal.
- JPEG: somente aceitar regravação com assinatura coerente, decodificação,
  mesmas dimensões e comparação aproximada de pixels; original preservado em falha.
- Testes visuais: XHTML reflowable e geometria fixed-layout sintética comparados
  nos motores Chromium, Firefox e WebKit. Não é homologação em Kindle, Calibre,
  Apple Books ou aparelhos reais.
- Gate V8 da `dev`: cinco módulos críticos com limites mínimos medidos por
  arquivo. Não contabilizar os módulos ainda sem cobertura como testados.


## Matriz EPUB 2/3 por perfil do padrão (execução 13)

**Atenção à especificação:** o campo OPF `package version="3.0"` é obrigatório
para EPUB **3.0, 3.2, 3.3 e 3.4**. Não escrever `version="3.4"` nem inferir
a revisão do livro a partir do atributo; os requisitos variam por recursos e
edição da especificação usada na validação. Versões declaradas como 3.2/3.3/3.4
recebem alerta de OPF não compatível e ficam sem reescrita automática.

| Perfil de conformance avaliado | Valor OPF correto | Caso de teste | Limitação |
| --- | --- | --- | --- |
| EPUB 2.0/2.0.1 | `2.0` | EPUB 2 com NCX e spine, antes/depois EPUBCheck | Não é certificação universal de EPUB 2 |
| EPUB 3.0 | `3.0` | EPUB 3 core com XHTML e nav | Teste sintético de base |
| EPUB 3.2 | `3.0` | `epub32-navigation`, page-list EPUB 3 | Recurso representativo, não suite 3.2 completa |
| EPUB 3.3 | `3.0` | `epub33-mathml`, MathML com `properties="mathml"` | Recurso representativo, não suite 3.3 completa |
| EPUB 3.4 (CR Draft 2026) | `3.0` | `epub34-fixed-layout`, layout pré-paginado e viewport | EPUBCheck 5.4.0 não certifica regras novas da 3.4 |

`tests/epubCheckFixtureGenerator.test.ts` gera as quatro fixtures EPUB 3
separadas e a CI verifica a revalidação e preservação do XHTML pelo reparo,
seguida do EPUBCheck 5.4.0 externo por perfil.

Fontes normativas:
- https://www.w3.org/TR/epub-33/#sec-package-elem
- https://www.w3.org/TR/epub-34/#sec-package-elem
- https://w3c.github.io/epub-specs/archive/epub32/spec/epub-packages.html

Não presumir atualização automática de minor version nem afirmar
que as suites externas completas de EPUB 3.4 foram executadas.
