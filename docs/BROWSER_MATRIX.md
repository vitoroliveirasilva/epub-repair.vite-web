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
