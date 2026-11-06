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

## Kindle Previewer 4 oficial (execução 18)

A CI [42219786288](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42219786288)
instalou `kindle-previewer` via Homebrew no macOS-15 (versão
**4.0.1**, binário oficial `KindlePreviewer4CLI`). A opção correta
da versão 4 é `--convert --output`, diferente da documentação antiga
do Previewer 3, que usava apenas um hífen.

Conversão real para KPF, ambas com status de processo 0:

- EPUB 3 reparado: `repaired-valid_epub.kpf`;
- EPUB 2 reparado: `repaired-valid-epub2_epub.kpf`;
- EPUB 3 com TOC autoral: `repaired-valid-ncx-hierarchy_epub.kpf`.

Esses três arquivos também foram aceitos pelo Calibre CLI real
no Ubuntu e pelo EPUBCheck 5.4.0. **O resultado KPF não garante a
aparência visual de cada página nem o comportamento de um dispositivo
Kindle físico.** A checagem específica visual permanece no E-076.

## Calibre ebook-viewer GUI aprovada em duas execuções

Além de `ebook-meta`/`ebook-convert`, o pipeline instala Calibre
7.6.0 e abre o **ebook-viewer** no Xvfb/Openbox. Testa livro
reflowable e livro fixed-layout com SVG, CSS e texto XHTML preservados;
cada screenshot 1440×900 deve conter mais de 2.000 pixels da cor
esperada. Foram observados **81.170** e **42.657**, respectivamente.

Execuções: [42220639254](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42220639254) e
[42220831312](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42220831312), ambas verdes.
A validação é gráfica real do Calibre e adicional ao Kindle Previewer
4 CLI, sem implicar homologação física em Kindle/iPhone.
