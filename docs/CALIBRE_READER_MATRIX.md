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

## Evidência real aprovada em 06/11/2026

[GitHub Actions 42215134048](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42215134048)
concluiu com sucesso usando `ebook-meta` e `ebook-convert` verdadeiros
do pacote Calibre instalado no Ubuntu, em quatro EPUBs reparados:

- `repaired-valid.epub`, EPUB 3;
- `repaired-valid-epub2.epub`, EPUB 2;
- `repaired-valid-ncx-hierarchy.epub`, EPUB 3 com hierarquia NCX→NAV;
- `profile-epub3-core.epub`, perfil EPUB 3 core.

Além da importação, o caso de NCX hierárquico comprovou a presença de
**Seção principal** no texto extraído. Ainda falta avaliar renderização
visual no `ebook-viewer`, Kindle Previewer/Apple Books e dispositivos
físicos; portanto E-090 permanece parcial.
