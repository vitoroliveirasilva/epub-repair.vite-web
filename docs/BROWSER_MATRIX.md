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
