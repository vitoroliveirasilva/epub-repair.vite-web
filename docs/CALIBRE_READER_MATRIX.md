# Testes com leitor Calibre (E-090)

O workflow `.github/workflows/calibre-reader.yml` usa o aplicativo
**Calibre CLI real instalado no runner Ubuntu**, não um simulador de
EPUBCheck. A etapa produz EPUBs sintéticos *efetivamente reparados* pelo
motor e importa cada um com `ebook-meta` e `ebook-convert`.

Corpus inicial:

- EPUB 3 com conteúdo reparado;
- EPUB 2 + toc.ncx;
- EPUB 3 com NAV reconstruído de NCX hierárquico;
- EPUB 3 core com metadados/TOC.

Cada arquivo deve converter para TXT UTF-8 não vazio e manter
marcadores editoriais conhecidos, sem exigir pixel-perfect de um
leitor que gera TXT. Logs e texto extraído são arquivados como artifact
por 14 dias.

**Interpretação:** esse teste prova aceitação do EPUB pela versão
Calibre disponível no runner, e preservação de texto selecionado.
**Não equivale a renderização em ebook-viewer, Kindle Previewer,
Apple Books ou Kindle físico**. O item E-090 deve continuar parcial
até as homologações que dependem desses leitores.

A CI EPUBCheck continua independente e mantém a matriz EPUB 2/3
de conformance; não substituir EPUBCheck por Calibre nem vice-versa.
