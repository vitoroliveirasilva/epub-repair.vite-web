# epub-repair.vite-web

[![Netlify Status](https://api.netlify.com/api/v1/badges/0a6d6315-875c-4375-a73f-87859903eb27/deploy-status)](https://app.netlify.com/projects/epubrepair/deploys)
[![CI](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/workflows/ci.yml/badge.svg?branch=prod)](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Vite](https://img.shields.io/badge/Vite-7.x-646CFF?logo=vite&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Vitest](https://img.shields.io/badge/tests-Vitest-6E9F18?logo=vitest&logoColor=white)
![ESLint](https://img.shields.io/badge/lint-ESLint-4B32C3?logo=eslint&logoColor=white)
![Client-side](https://img.shields.io/badge/processing-client--side-brightgreen)
![No backend](https://img.shields.io/badge/backend-none-lightgrey)
![Privacy](https://img.shields.io/badge/privacy-local--first-success)
![Static Site](https://img.shields.io/badge/deploy-static--site-orange)

Ferramenta **front-end estática** para validar, reparar e reempacotar arquivos `.epub` diretamente no navegador, com foco em aumentar a compatibilidade com fluxos de envio/upload para Kindle.

O projeto não possui backend, banco de dados nem integração com APIs externas. O EPUB é carregado, analisado, reparado e baixado localmente no navegador do usuário.

## Privacidade e segurança

* O arquivo EPUB **não é enviado para servidor**.
* Todo processamento acontece no navegador.
* O app pode ser hospedado como front-end estático.
* O modo Kindle Safe neutraliza scripts, handlers inline, `javascript:`, `iframe`, `embed`, `object`, referências remotas e caminhos internos suspeitos quando possível.
* Caminhos internos do ZIP são normalizados e entradas com path traversal, caminhos absolutos ou colisões são sinalizadas.
* O arquivo original não é alterado. Sendo assim, o reparo apenas gera uma nova cópia para download.

## O que a validação verifica

* Estrutura ZIP/OCF
* `mimetype` na raiz com conteúdo exato, primeira entrada e sem compressão quando possível
* `META-INF/container.xml`
* Localização do OPF
* Metadados básicos: título, idioma e identificador
* Datas OPF em formato frágil
* Versão antiga do pacote OPF
* Manifest, media types, duplicidades e recursos ausentes
* Spine e `itemref` inválido
* Imagem de capa declarada, ausente ou apenas detectada como candidata
* `nav.xhtml` em EPUB 3
* `toc.ncx` em EPUB 2 ou quando declarado
* `playOrder` duplicado, fora de ordem ou navegação incompleta em relação ao spine
* Referências em HTML/XHTML: imagens, links, `srcset`, `poster`, `data`, `xlink:href` e `kindle:embed:*`
* XHTML com `&nbsp;`, `lang/xml:lang` vazio ou ausente e meta `Content-Type` suspeita
* Referências em CSS: `url(...)` e `@import`
* JPEG progressivo
* Recursos órfãos relevantes
* Arquivos de sistema desnecessários
* Sinais de criptografia, DRM ou metadados avançados

Os problemas são classificados como `fatal`, `error`, `warning` ou `info`, com código, arquivo afetado, explicação e indicação de reparo automático quando aplicável.

## O que o reparo corrige

* Reempacota o EPUB com `mimetype` primeiro, sem compressão e com conteúdo exato
* Reconstrói `META-INF/container.xml` quando necessário
* Preserva o OPF e corrige apenas o necessário
* Completa metadados básicos faltantes sem apagar os existentes
* Normaliza idioma inválido/genérico e datas OPF frágeis
* Atualiza `package version="1.0"` para uma base EPUB 2 mais segura quando aplicável
* Declara a imagem de capa quando há uma candidata segura no manifest
* Corrige ids duplicados/ausentes no manifest
* Corrige media types quando a extensão indica o tipo correto
* Remove do manifest itens claramente inexistentes, inválidos ou duplicados
* Adiciona ao manifest recursos relevantes existentes que estavam órfãos
* Remove `itemref` inválido do spine e reconstrói a ordem de leitura quando ela está vazia
* Preserva `nav.xhtml` e `toc.ncx` válidos
* Cria `nav.xhtml` apenas quando EPUB 3 precisa e ele está ausente
* Cria `toc.ncx` para EPUB 2 ou quando ele está declarado e ausente
* Normaliza `playOrder` e adiciona ao NCX itens do spine
* Transforma links externos em texto legível
* Transforma `kindle:embed:*` em marcador textual seguro
* Substitui imagens ausentes por marcador visível, como `[Imagem indisponível: nome-da-imagem]`
* Remove scripts, handlers inline, `javascript:`, iframes, embeds e objects no modo seguro
* Neutraliza referências CSS remotas ou quebradas
* Normaliza `&nbsp;`, `lang/xml:lang` e meta `Content-Type` em XHTML no modo completo
* Tenta converter JPEG progressivo para baseline quando o navegador permite
* Revalida o EPUB depois do reparo e mostra antes/depois

O arquivo gerado preserva o nome original e adiciona apenas o sufixo mínimo `-k`. Ou seja, o nome `Livro.epub` se torna `Livro-k.epub`, por exemplo.

## Experiência de uso

* Fluxo guiado: verificar, corrigir e baixar
* Prévia visual da capa detectada quando a imagem é pequena e segura para preview local
* Relatório simples para leitura rápida
* Relatório técnico recolhido para investigação de códigos e arquivos afetados
* Exportação de relatório em TXT e JSON
* Scores separados para estrutura EPUB, compatibilidade Kindle e segurança
* Modo conservador para reduzir alterações em conteúdo interno

## Limitações

* Não remove DRM
* Não descriptografa conteúdo
* Não recria imagens, fontes ou capítulos que não existem no arquivo original
* Não garante aceitação universal em todos os fluxos do Kindle
* Não substitui o EPUBCheck oficial, pois a proposta é a correção de problemas comuns e o aumento de compatibilidade prática
* EPUBs extremamente corrompidos ou sem OPF válido podem exigir correção manual

## Como rodar localmente

```bash
npm ci
npm run dev
```

Acesse a URL exibida pelo Vite, normalmente disponível em `http://localhost:5173`.

## Build de produção

```bash
npm run build
```

O build final será gerado em `dist/` e pode ser publicado em qualquer hospedagem de front-end estático.

Para testar o build localmente:

```bash
npm run preview
```

## Qualidade

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

O repositório possui GitHub Actions para executar automaticamente o mesmo portão de qualidade em pushes e pull requests para `prod`.

Também há fixtures EPUB sintéticas em testes para preservar cenários críticos de compatibilidade como OPF legado, capa não declarada, NCX problemático, XHTML frágil e JPEG progressivo.

## Estrutura de diretórios

```txt
.
├─ .github/
│  ├─ dependabot.yml
│  └─ workflows/
│     └─ ci.yml
├─ public/
├─ src/
│  ├─ app/                 # Estado e ações da aplicação
│  ├─ epub/
│  │  ├─ model/            # Tipos de EPUB, OPF, issues e reparo
│  │  ├─ reader/           # Leitura ZIP/EPUB e inspeção do diretório central
│  │  ├─ validation/       # Validadores de OCF, OPF, navegação, HTML e CSS
│  │  ├─ repair/           # Reparos e reempacotamento do EPUB
│  │  ├─ sanitize/         # Sanitização segura de HTML/XHTML e CSS
│  │  └─ utils/            # Caminhos, XML, media types, relatório e nomes
│  ├─ ui/                  # Componentes e helpers de interface
│  └─ styles/              # CSS principal
├─ tests/
│  ├─ helpers/             # Fixtures sintéticas reutilizáveis
│  └─ *.test.ts            # Testes unitários das funções críticas
├─ index.html
├─ vite.config.ts
├─ vitest.config.ts
├─ tsconfig.json
└─ eslint.config.js
```