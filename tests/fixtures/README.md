# Corpus sintético de regressão EPUB

O arquivo `tests/corpusHistorical99.test.ts` gera, em memória, **18 EPUBs sintéticos** a partir
de variações determinísticas de uma obra original mínima de teste.

A lista cobre problemas históricos observados na auditoria: caminhos de navegação,
índices seletivos (sem falso positivo), links com entidades, recursos remotos HTTP/HTTPS
legítimos, CSS executável, SVG, JavaScript órfão, manifest, imagens, declarações de capa,
Media Overlays/SMIL, XML malformado e metadados.

As fixtures são geradas exclusivamente com texto sintético e não utilizam conteúdo de
obras protegidas. Elas são verificadas na CI com Vitest, sem upload de EPUBs de usuários.

**Limites:** o corpus não equivale a um conjunto representativo de todos os arquivos EPUB
do mercado. A cobertura dos casos já observados não substitui testes em leitores reais,
novos ataques adversariais nem a validação de desempenho/memória. EPUBCheck 5.4.0
continua validando separadamente os EPUB 2/3 gerados pelo teste oficial do workflow.
