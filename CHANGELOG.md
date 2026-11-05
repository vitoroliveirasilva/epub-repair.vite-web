# Histórico de mudanças do EPUB Repair

Alterações na branch `dev` **ainda não publicadas**. O pacote e a branch `prod` continuam em **v2.2.0**. Esta página documenta desenvolvimento e não representa uma nova release.

## Unreleased: auditoria dos 99 itens, execuções 1 a 6 (05/11/2026)

### Segurança de entradas e integridade

- Verificação dos cabeçalhos ZIP, duplicatas, sobreposição, offsets, CRC, descritores de dados, ZIP64 e multipartes; formatos ambíguos são recusados.
- Proteção de descompactação por limites de entrada e de bytes; fluxo extraído verificado contra o tamanho declarado.
- XML com entidades externas e inclusões perigosas bloqueadas; DTDs legadas conhecidas NCX/XHTML tratadas estritamente.
- Inspeção de URLs e CSS ativos após decodificação, preservando links/fontes HTTP/HTTPS legítimos.
- Diagnóstico de anexos com assinatura de executável e inventário de scripts declarados e órfãos. O app não substitui antivírus.

### Preservação e conformidade editorial

- Proteções sobre capítulos, ordem do spine, `linear`, texto integral, parágrafos, headings, IDs, notas e remissões.
- Proteção de destinos NCX e estruturas específicas MathML, ruby e direção explícita de leitura RTL.
- Inspeção de navegação EPUB 3 (`toc`, `page-list`, `landmarks`) e metadados OPF.
- Verificação não destrutiva de SMIL/Media Overlays e EPUB 3 fixed-layout.
- Diagnósticos de CSS repetido/sobrescrito e múltiplas declarações de capa sem alteração editorial arbitrária.

### Qualidade e interface

- Reparo sem mudanças não cria cópia artificial; testes de idempotência e bytes preservados para diversos cenários.
- Manutenção de foco/cursor em redesenhos de tela e relatórios técnicos comparando XHTML, CSS, OPF e NCX antes/depois.
- Relatório de SHA-256 do EPUB originalmente carregado, snapshot das opções e ações realmente realizadas.
- EPUBCheck 5.4.0 nas fixtures sintéticas EPUB 2 e 3, CI em Node.js 20/22 com testes, lint, build e auditoria de dependências/licenças.

### Limitações e bloqueios de release

- Ainda restam itens parciais ou não iniciados em [AUDITORIA_99_PROGRESSO.md](docs/AUDITORIA_99_PROGRESSO.md).
- Faltam testes visuais e homologação em leitores/dispositivos físicos; EPubCheck e testes sintéticos não provam universalidade.
- Nenhum merge de `dev` em `prod` deve ser feito antes da revisão dos P0, da CI e da homologação de conteúdo real.

## v2.2.0: versão publicada

A release estável permanece inalterada nesta execução. Consultar [notas oficiais](.github/release-notes/v2.2.0.md) e tags do repositório.
