# Histórico de mudanças do EPUB Repair

Alterações na branch `dev` **ainda não publicadas**. O pacote e a branch `prod` continuam em **v2.2.0**. Esta página documenta desenvolvimento e não representa uma nova release.

## Unreleased: execução 9 (05/11/2026)

- Fallbacks de tipos estrangeiros, incluindo imagens HEIC em XHTML e fallback XHTML/SVG no spine. Nenhum conteúdo de leitura é inventado.
- Validação de datas UTC, unique-identifier, prefixos e refines do OPF sem alteração arbitrária dos metadados.
- Verificação de conteúdo remoto por MIME e versão EPUB, preservando fontes e links HTTPS legítimos.
- Media Overlays: IDs, namespaces, fontes MIME e integridade dos vínculos/bytes SMIL antes/depois do reparo.
- Reutilização dos arquivos ZIP já descompactados entre inspeção inicial e reparo, com regressões de equivalência de relatório.
- Matriz de testes da ordem de leitura e recursos estrangeiros.

**Auditoria:** 72 concluídos, 19 parciais e 8 pendentes. Leitores e navegadores físicos permanecem fora da cobertura automatizada.

## Unreleased: execução 8 (05/11/2026)

- Corrigida a perda de referências a renditions secundárias quando o container possui múltiplos rootfiles válidos.
- Manifests de edições diferentes não são fundidos automaticamente e revisões parciais ficam identificadas.
- Inspeção estrutural de scripts/embeds e extração de links reais sem falso positivo em comentários ou código editorial.
- Inventário de JavaScript declarado e órfão, incluindo avisos de revisão manual nos modos de reparo e otimização.
- Proteção de nomes ZIP e validação de anchors/fragmentos Unicode em NAV/NCX.
- Regressões de payloads polyglot ZIP e respeito a comentários ZIP legítimos.
- Testes da configuração CSP/Netlify; comportamento real em WebKit e headers HTTP ainda pendente.

**Auditoria:** 67 concluídos, 24 parciais e 8 pendentes, conforme o [quadro por item](docs/AUDITORIA_99_PROGRESSO.md).

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
