# Matriz automatizada de browsers (E-089/E-082)

O workflow `.github/workflows/browser-matrix.yml` inicia o Vite localmente
em Linux headless e executa o fluxo real em **Chromium, Firefox e WebKit**
(desktop e viewport de 390 × 844 px). Playwright `1.55.1` é instalado
na CI como ferramenta de testes isolada, não como dependência de produção.

O teste gera um EPUB sintético com JSZip, valida a interface, altera tema,
carrega arquivo, aguarda análise em Worker/fallback e baixa relatório JSON.
Falha de browser, JavaScript não tratado ou download ausente reprovam o job.

**Limites:** WebKit no Linux não representa Safari em iPhone/iPad. Emulação
de tela não comprova comportamento de Safari iOS nem compatibilidade com
Kindle Previewer, Calibre ou Apple Books. Não classificar E-089 como
integralmente concluído sem essas evidências.

## Execução 12: comparação visual do conteúdo sintético

Agora os três motores também executam `presentationAndImageSmoke()`. A fixture EPUB 3
sem `mimetype` é realmente reparada. Em seguida, os capítulos XHTML reflowable e
com medidas fixed-layout são renderizados **antes/depois no mesmo navegador**.
Capturas PNG têm SHA-256 comparado, e o teste confere medidas CSS/DOM,
tipografia, texto, imagem PNG embutida e estágio 800×600.

A conversão de JPEG progressivo real é executada via canvas e conferida
como baseline; a carga de capa JPEG também é testada com fallback conservador
quando não houver suporte suficiente para normalizar. Resultado de referência:
[matriz 42143349623](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42143349623),
Chromium, Firefox e WebKit aprovados.

Esses testes rodam em **Linux headless**, não no Kindle, Calibre, Apple Books,
ou em iPhone/iPad reais. A alteração foi considerada avanço parcial E-076,
não homologação da apresentação editorial de livros reais.

## Execução 13: CSP aplicada ao bundle e teste de recursos

O workflow agora compila a aplicação (`npm run build`) e inicia
`vite preview` separado do Vite dev. `tests/browser-csp.mjs` injeta
`Content-Security-Policy` no header da resposta desse preview e testa
o fluxo de arquivo e Worker sob a política em cada um dos três engines.
Os eventos de violação confirmam bloqueio de scripts inline e rede remota;
imagens locais em `data:` e `blob:` e download JSON devem funcionar.
A exceção de `upgrade-insecure-requests` é **apenas para localhost HTTP**,
pois a produção real usa TLS.

O job Chromium também executa `tests/browser-resource-budget.mjs`
com EPUBs sintéticos 1/12 MiB, medição CDP de heap JS principal e
limites de duração. Isso **não equivale a teste de RAM total** nem
certificação para 250 MiB ou Safari iOS real.

## CI aprovada da execução 13

[Run 42149808645](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42149808645):
**Firefox, WebKit e Chromium concluídos com sucesso**.
O app compilado sob CSP simulada carregou Worker real, apresentou resultado,
bloqueou script inline e conexão externa e permitiu imagem e download local.
No Chromium, o teste adicional de performance 1/12 MiB também passou.
O screenshot sintético permanece sem perda de fidelidade antes/depois.

A otimização do workflow evitou `apt` redundante para Chromium no runner,
mantendo `playwright install --with-deps` em Firefox/WebKit. A política CSP
real em produção HTTPS e o Safari iOS físico continuam sem homologação.

## Stress de fronteira 250 MiB

A matriz da `dev` inclui agora cenário Chromium headless de 250 MiB
**descompactados** em três recursos, com verificação de integridade,
roundtrip, heartbeat e orçamento de tempo/heap da thread principal.
Resultados [42153236152](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42153236152):
**19.807 ms** para extração/reparo/revalidação, JS heap amostrado
**+2,9 MiB** na aba, heartbeat 388.
WebKit e Firefox permanecem no smoke funcional, não executam
este benchmark de tamanho máximo. Sem medir pico RSS/Worker nem
aparelhos físicos.

## Execução 16: fluxo EPUB 12 MiB com Workers reais e viewport móvel

`tests/browser-large-workflow.mjs` abre EPUB 12 MiB com recurso binário
pseudorrandômico, executa análise/reparo com interface real, observa
**três Workers** (descompactação inicial, descompactação no reparo,
recompactação ZIP), baixa arquivo novo e reabre com JSZip verificando
12 MiB recuperados byte-a-byte quanto ao comprimento e texto editorial.

No [workflow 42213708002](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42213708002),
as matrizes **Chromium e Firefox** aprovaram esse fluxo de viewport móvel.
O job WebKit mais recente estava em instalação no momento do registro;
seus smokes menores já haviam passado anteriormente. Não equiparar
viewport mobile a Safari/iOS físico. O Calibre foi incorporado como
workflow independente, mas Kindle/AppleBooks permanecem sem homologação.

## Execução 17: navegador em Netlify HTTPS hospedado

`tests/browser-csp.mjs` aceita `EPUB_APP_URL`: no Netlify não aplica
interceptação e exige que o CSP HTTP REAL coincida exatamente com
`netlify.toml`. `tests/browser-large-workflow.mjs` também aceita a URL
e executa EPUB de 12 MiB com três Workers, recompactação e download.

O workflow `.github/workflows/netlify-live-preview.yml` espera a URL
da PR, valida headers no `curl` e utiliza Playwright Chromium contra
o deploy-preview HTTPS. Sucesso em [run 42215134060](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42215134060).

A cobertura de Safari/iOS **físico** e de leitores Kindle/Apple Books
continua ausente e não foi usada para concluir os demais itens.

### Evidência complementar da matriz mobile headless (06/11/2026)

A [CI 42215133974](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42215133974)
concluiu **Chromium, Firefox e WebKit** com sucesso, incluindo
`tests/browser-large-workflow.mjs`: EPUB 12 MiB, três Workers,
download do EPUB e reabertura ZIP para verificar integridade e texto.
Firefox usa viewport estreito sem fingir suporte à emulação nativa
`isMobile`; WebKit em Linux não equivale a Safari iOS físico.

## E-076: validação de renderização no Calibre ebook-viewer (06/11/2026)

O `ebook-viewer` real, instalado no runner Ubuntu com display Xvfb e
Openbox, abriu EPUBs **reparados** `visual-reflowable.epub` e
`visual-fixed-layout.epub`. XHTML original, CSS e SVG ficam
**byte-a-byte idênticos** nos ZIPs antes/depois do reparo.
Capturas 1440×900 incluem 81.170 pixels da cor da imagem reflowable
e 42.657 pixels da cor do exemplo fixed layout, ambas bem acima de
2.000 exigidos pela CI. Resultados reproduzidos:
[42220639254](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42220639254) e
[42220831312](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42220831312).

Verificação de cor e abertura NÃO é avaliação completa de
pixel-perfect, layout tipográfico, acessibilidade de cada capítulo,
fontes externas ou aparência Kindle/iPhone. E-076 conclui somente
o critério de verificação automatizada de apresentação reflowable/
fixed-layout e ilustração em leitor externo.

## Execução 20: sistemas móveis simulados e deploy-preview real

Foram acrescentados dois testes independentes:

- Android 15 Google Play AVD + Chrome, via Playwright Android (API
  experimental) e ADB, checando envio/reparo/download de EPUB;
- Safari do iPhone Simulator oficial do Xcode, via Appium XCUITest,
  com envio, reparo, captura e investigação do arquivo baixado.

A criação dos testes é evidência de ampliação da matriz, **não de
execução aprovada**. Primeiros bugs do harness foram corrigidos,
e os jobs seguintes estão sujeitos a inicialização longa de
simuladores/WDA. O critério de conclusão dos itens E-082 e E-089
continua sendo validação em iPhone/Android físicos, não no emulador.

A [homologação HTTPS Netlify do PR #32](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42231322872)
já passou novamente, e a produção foi preservada.
