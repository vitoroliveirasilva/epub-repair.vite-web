# Estado atual do EPUB Repair

**Data-base:** 12/11/2026. **Fonte de verdade:** árvore de código e configuração em `dev`/`prod`, `package.json`, `netlify.toml`, workflows e PRs integradas. Este documento **não substitui** a consulta ao HEAD e aos checks de uma nova PR.

## Situação de produto e versionamento

| Dimensão | Estado verificado |
| --- | --- |
| Nova release | [v3.0.0](https://github.com/vitoroliveirasilva/epub-repair.vite-web/releases/tag/v3.0.0), publicada automaticamente após CI aprovada na `prod` |
| Versão do código | `3.0.0` em `package.json` e `package-lock.json` |
| Produção | `prod`, publicada em https://epubrepair.netlify.app/ |
| Desenvolvimento | `dev`, com commits diretos e PRs para `prod` |
| Última revisão considerada | PR [#54](https://github.com/vitoroliveirasilva/epub-repair.vite-web/pull/54), footer padronizado em 12/11/2026 |
| Aplicação | Vite 8 + TypeScript 6, páginas `/` e `/converter`, hospedagem estática |
| Dependências principais | JSZip 3, PDF.js 5, Tesseract.js 7 e pacotes de idioma português/inglês |
| Backend/banco | Não existentes neste projeto; processamento de EPUB/PDF local no navegador |

A release `v2.5.0` documenta o motor EPUB na data de sua tag. A `v3.0.0` consolida as PRs #43–#54 posteriores, com o conversor PDF → EPUB e melhorias de fidelidade, UX e navegação. A automação publica a tag somente após CI aprovada no commit atual de produção.

## Recursos entregues e seus limites

### Rota `/`: validação e reparo EPUB

- Leitura ZIP/OCF, diagnóstico de `mimetype`, `container.xml`, OPF, manifest, spine, NAV/NCX, XML/XHTML/CSS, imagens, links e metadados.
- Relatórios simples/técnicos e exportação em TXT/JSON; informações de gravidade, localização e necessidade de conferência manual.
- Correção técnica com salvaguardas de preservação editorial, normalização do pacote e revalidação da cópia gerada.
- Troca/aditamento da capa, quando a imagem é aceita e o usuário escolhe fazê-lo.
- Progresso de extração/recompactação e cancelamento; Workers de mesma origem quando suportados.
- Fila temporária e limitada para tarefas compatíveis do mesmo EPUB.

**Não há garantia:** de correção automática para todos os avisos, de renderização idêntica em todos os leitores, de preservação de recursos em entradas corrompidas ambíguas, nem de ausência de malware.

### Rota `/converter`: PDF → EPUB

- Verificação de extensão/tipo, assinatura PDF e limite de 250 MB; PDFs com senha não são desbloqueados.
- Leitura de texto nativo, detecção de colunas/figuras e classificação de páginas.
- OCR opcional local, com idiomas `pt-BR` e `en`; timeouts e fallback não certificam o reconhecimento.
- Reconstrução heurística de parágrafos, capítulos, imagens, sumário e metadados.
- Perfil `book`, `academic`, `visual` e formato `auto`, `reflowable`, `fixed`.
- Edição da obra e comparação visual entre páginas PDF e seções EPUB, com painel avançado que preserva seu estado de expansão.
- Geração de EPUB ZIP, validação pelo motor interno e acabamento automático conservador antes de liberar o resultado.

**Não há garantia:** de identidade tipográfica/paginação, OCR sem erros, conversão sem revisão de formulários, equações ou elementos gráficos muito pequenos. A pontuação de confiança é heurística.

### Interface

- Temas claro/escuro.
- Navbar móvel em modal lateral de tela inteira com `dialog`, rolagem interna, fechamento por X/Escape, suporte a foco e respeito à preferência de movimento reduzido.
- Footer uniforme nas duas rotas: **Desenvolvedor**, **Projeto no GitHub**, **Reparar EPUB**, **Converter PDF**.
- Avisos, erros e pontos para conferência renderizados em cards responsivos; o card de alertas do conversor não possui limite fixo de altura.
- Spinner de progresso do conversor preserva a animação enquanto texto/percentual são atualizados, sem remontar o card a cada página.

## Evidência e pendências que continuam abertas

| Classe | Evidência existente | O que não se deve concluir |
| --- | --- | --- |
| Qualidade estática | CI de Node 20/22, TypeScript, lint, Vitest, build, npm audit | Ausência de todos os bugs |
| EPUB técnico | Fixtures EPUB 2/3 verificadas por EPUBCheck 5.4.0 oficial na CI | Certificação de qualquer EPUB enviado |
| Interface | Playwright Chromium, Firefox e WebKit, desktop/viewport móvel | Teste físico em Safari iPhone, Samsung Internet ou leitores Kindle |
| Preservação | Regressões de texto, ZIP, imagens, navegação, idempotência | Fidelidade editorial absoluta para PDFs/livros arbitrários |
| Segurança | CSP e Workers de mesma origem, limites de ZIP e checks de supply chain | Antivírus completo ou isolamento offline integral |
| Auditoria 99 | Relatório histórico com **97 concluídos e 2 parciais** em 06/11/2026 | Fechamento automático de E-082/E-089 apenas por CI |

**E-082:** download e abertura de EPUB no Safari de iPhone/iPad físico sem comprovação abrangente registrada. **E-089:** Chrome/Firefox em Android físico e experiência end-to-end sem comprovação abrangente registrada. Os harnesses de emuladores existem, mas não substituem aparelho físico.

## Critério de atualização deste documento

Atualizar este registro quando houver **mudança de funcionalidade**, nova **release/tag**, novo **workflow/check requerido**, alteração de **limite de entrada**, **deploy**, mudança de **CSP** ou **evidência de hardware físico**. Para cada afirmação nova, apontar código, commit/PR, teste ou resultado observável.

Históricos não são apagados para “alinhar” números atuais; recebem identificação da data e conexão com este documento.

## Guias relacionados

[README](../README.md) · [Arquitetura](ARQUITETURA.md) · [Conversor PDF](CONVERSOR_PDF_EPUB.md) · [Qualidade e testes](QUALIDADE_TESTES.md) · [Deploy](DEPLOY_OPERACAO.md) · [Histórico de mudanças](../CHANGELOG.md).
