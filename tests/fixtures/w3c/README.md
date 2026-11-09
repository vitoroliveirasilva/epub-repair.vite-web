# Corpus externo W3C EPUB Tests

Esta pasta contém arquivos **originais de três amostras do W3C EPUB Tests**,
incluídos com licença e atribuição intactas:

- `cnt-xhtml-support`: documento XHTML.
- `cnt-mathml-support`: equação MathML integrada.
- `cnt-svg-embedded`: SVG incorporado ao XHTML.

Fonte oficial: https://github.com/w3c/epub-tests/tree/54092b4233253e9aac80e93ec4782b380b4b3403/tests

**Revisão de origem fixada:** `54092b4233253e9aac80e93ec4782b380b4b3403`.
O conteúdo `EPUB/` de cada amostra é mantido integralmente. O arquivo
`META-INF/container.xml`, igual nas três amostras, é compartilhado.

**Licença:** W3C Software and Document License, conforme
https://github.com/w3c/epub-tests/blob/main/LICENSE.md e
https://www.w3.org/Consortium/Legal/copyright-software.
Créditos de autores, direitos e links originais permanecem nos OPFs.

**Teste:** `tests/w3cExternalCorpus.test.ts` reempacota estes arquivos
offline com JSZip. O teste introduz somente compressão indevida do
`mimetype` no contêiner para provocar correção reproduzível e exige
integridade do texto, navegação, MathML e geometria SVG no resultado.
Duas variantes adversariais também injetam scripts nos documentos XHTML e
SVG para confirmar que a limpeza preserva o conteúdo original e o índice.

**Limitações:** a amostra é pequena e não é o ZIP binário oficial. Não
comprova compatibilidade universal de EPUBs extensos, produção, mobile
físico nem experiência visual real. A inspeção dos leitores continua separada.
