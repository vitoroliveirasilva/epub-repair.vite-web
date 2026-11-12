# EPUB Repair

[![Netlify Status](https://api.netlify.com/api/v1/badges/0a6d6315-875c-4375-a73f-87859903eb27/deploy-status)](https://app.netlify.com/projects/epubrepair/deploys)
[![CI](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/workflows/ci.yml/badge.svg?branch=prod)](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/release-v2.5.0-blue)](https://github.com/vitoroliveirasilva/epub-repair.vite-web/releases/tag/v2.5.0)
![Vite](https://img.shields.io/badge/Vite-8.x-646CFF)
![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6)
![License](https://img.shields.io/badge/license-MIT-green)

Aplicação estática, em português, para **reparar arquivos EPUB** e **converter PDF em EPUB** no navegador. Os documentos selecionados são processados localmente, sem backend de upload, banco de dados ou serviço remoto de conversão.

**Site:** https://epubrepair.netlify.app/ · **Reparar EPUB:** `/` · **Converter PDF:** `/converter`

> **Estado de referência: 12/11/2026.** A última release versionada confirmada é a `v2.5.0`. A branch `prod` já recebeu melhorias posteriores, inclusive o conversor PDF e a navegação móvel. Portanto, **versão publicada** e **conjunto de mudanças no HEAD** não são equivalentes. Consulte [o estado atual](docs/ESTADO_ATUAL.md), [o histórico](CHANGELOG.md) e o [pipeline de publicação](docs/DEPLOY_OPERACAO.md).

## Funcionalidades

| Ferramenta | O que faz | Limites |
| --- | --- | --- |
| **Reparar EPUB** (`/`) | Valida ZIP/OCF, OPF, manifest, spine, NAV/NCX, XHTML, CSS, referências e imagens. Oferece correções conservadoras, troca de capa e relatórios. | Um EPUB válido sintaticamente não é garantia de apresentação idêntica em todos os leitores. Ações ambíguas exigem revisão manual. |
| **Converter PDF** (`/converter`) | Lê texto e imagens, identifica páginas digitais/escaneadas, aplica OCR local quando configurado, reconstrói seções, permite revisar o conteúdo e gera EPUB ajustável ou de layout visual. | Não há conversão perfeita para toda diagramação. Tabelas, fórmulas, OCR, leitura em colunas e imagens pequenas podem exigir revisão editorial. |

### Reparar EPUB

1. Escolha um arquivo `.epub` e execute **Verificar**.
2. Consulte o relatório simples ou o técnico, com códigos e localização das ocorrências.
3. Revise a distinção entre correções automáticas, otimizações opcionais e pontos de conferência manual.
4. Execute o reparo técnico ou troque a capa, se necessário; avalie o resultado revalidado.
5. Baixe a nova cópia e, quando pertinente, exporte o relatório TXT/JSON.

O reparador diferencia operações **obrigatórias** de **opcionais**, não inventa idioma nem ordem editorial sem evidência e evita gerar um novo EPUB quando nada precisa ser corrigido. A troca de capa é separada do reparo. O resultado pode conter avisos ou itens que exigem análise humana.

### Converter PDF em EPUB

1. Abra `/converter` e selecione um PDF de até **250 MB**, sem senha.
2. Aguarde a classificação das páginas, a captura de ilustrações e, quando necessário, a leitura local de páginas digitalizadas.
3. Confira título, autor, editora, ano/data, ISBN, tradutor, idioma, perfil e formato.
4. Se desejar, expanda **Comparar e editar o conteúdo** para comparar páginas, revisar texto e ajustar a divisão de seções. O painel permanece aberto entre mudanças de página/capítulo.
5. Escolha **Gerar meu EPUB**. A saída é validada e passa por acabamento estrutural antes do download.

Perfis disponíveis: **Livro ou romance**, **Acadêmico ou documental** e **Visual ou diagramado**. Formatos: **automático**, **texto ajustável (reflowable)** e **layout visual fixo (fixed-layout)**. Entre os ajustes opcionais estão OCR, remoção de cabeçalhos/rodapés repetidos, números de página, hifenização artificial e normalização tipográfica.

O OCR utiliza arquivos de idioma português/inglês empacotados no próprio site, sem serviço externo de OCR. Interrupções e limites de tempo podem levar a avisos e à preservação visual de páginas, em vez de texto recuperado. **A confiança exibida é uma heurística**, não uma medida certificada de equivalência com o PDF.

Documentação detalhada: [Conversor PDF → EPUB](docs/CONVERSOR_PDF_EPUB.md).

## Privacidade e segurança

- Os arquivos escolhidos permanecem no navegador. Não há endpoint de upload nem backend de processamento no projeto.
- A distribuição do site, as dependências e a hospedagem continuam sujeitos às políticas normais da web; **processamento local não significa navegação totalmente offline**.
- Entradas ZIP/EPUB são inspecionadas com limites e verificações de estrutura. Recursos potencialmente ativos podem ser sinalizados ou neutralizados conforme a operação e o consentimento.
- Scripts do site, Workers e recursos OCR são entregues pela mesma origem. A política HTTP de produção está em `netlify.toml`.
- O sistema **não é antivírus**, não remove DRM, não desbloqueia PDFs protegidos e não substitui revisão de direitos autorais ou segurança de arquivos desconhecidos.

Consulte [Segurança e limites](docs/SEGURANCA_E_LIMITES.md) e [CSP/Netlify](docs/CSP_NETLIFY.md).

## Executar localmente

Requisitos: **Node.js 20 ou superior**, npm e navegador moderno.

```bash
npm ci
npm run dev
```

Acesse `http://localhost:5173/` para EPUB ou `http://localhost:5173/converter` para PDF.

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

O build Vite gera `dist/` e inclui os recursos necessários ao OCR local. Não edite arquivos de `dist/` manualmente. O comando `npm run scan:av` é um fluxo opcional separado, não uma garantia de detecção de malware.

## Qualidade e publicação

- Testes Vitest em Node e jsdom cobrem motor EPUB, conversão PDF e interfaces.
- PR pronta para `prod` executa verificações em Node 20/22, EPUBCheck 5.4.0 e matrizes adicionais quando os caminhos e eventos dos workflows correspondem.
- A matriz Playwright usa **Chromium, Firefox e WebKit**; simular uma tela de celular **não equivale** a homologar Safari iOS ou Android físicos.
- A implementação tem testes de preservação editorial, segurança, regressão, Workers e desempenho dentro de orçamentos definidos.
- **CI verde não certifica qualquer EPUB ou PDF do usuário.** Os itens históricos E-082 e E-089 continuam sem evidência conclusiva em hardware físico na documentação existente.

Fluxo de trabalho: desenvolvimento em `dev`, revisão por PR `dev` → `prod`, checks do HEAD candidato, merge controlado e verificação do deploy Netlify. O workflow de release utiliza o número do `package.json` e **não cria uma release nova a cada merge**.

Leia [Qualidade e testes](docs/QUALIDADE_TESTES.md), [CI econômica](docs/CI_ECONOMICO.md), [Política de branches](docs/BRANCH_POLICY.md) e [Deploy e operação](docs/DEPLOY_OPERACAO.md).

## Organização do código

```text
src/
  app/                Fluxo de validação, reparo, capa, fila e Workers
  converter/          Leitura PDF, OCR, reconstrução, revisão e criação EPUB
  epub/
    reader/           Entrada e inspeção ZIP
    validation/       Regras de validação EPUB
    repair/           Correções e reempacotamento
    sanitize/         Sanitização e referências
    cover/            Operações de capa
    utils/            Utilitários e relatórios
  ui/                 Componentes e navegação
  styles/             Estilos gerais, responsivos e específicos
tests/                Vitest, browser smoke e corpus sintético/W3C
scripts/              Checagens auxiliares, licenças e políticas
.github/workflows/    CI, browsers, cobertura, segurança, release e emuladores
docs/                 Guias operacionais e evidências históricas
```

A rota `/converter` e a rota `/` são selecionadas em `src/main.ts` e carregadas sob demanda. O site usa um único `index.html` e fallback SPA na Netlify.

## Índice da documentação

Consulte o [índice documental completo, com distinção entre guias vigentes e registros históricos](docs/INDICE.md).

**Documentos de consulta atual:**

- [Estado atual e escopo](docs/ESTADO_ATUAL.md)
- [Arquitetura e fluxo de dados](docs/ARQUITETURA.md)
- [Manual e especificação do conversor PDF](docs/CONVERSOR_PDF_EPUB.md)
- [Guia de desenvolvimento](docs/GUIA_DESENVOLVIMENTO.md)
- [Qualidade, testes e limites da evidência](docs/QUALIDADE_TESTES.md)
- [Deploy, CI e operação](docs/DEPLOY_OPERACAO.md)
- [Segurança, privacidade e limites](docs/SEGURANCA_E_LIMITES.md)
- [Matriz de compatibilidade EPUB](docs/MATRIZ_COMPATIBILIDADE.md)
- [Homologação em dispositivos físicos](docs/HOMOLOGACAO_MOBILE_REAL.md)

**Histórico e registros de auditoria:** [Auditoria original de 99 itens](docs/AUDITORIA_99_BASE.md), [progresso histórico](docs/AUDITORIA_99_PROGRESSO.md), [auditorias complementares](docs/AUDITORIA_POST99.md), [decisões](docs/DECISOES_AUDITORIA.md), [CHANGELOG](CHANGELOG.md) e [notas das releases](.github/release-notes/). Esses arquivos preservam evidências e estados da data de cada execução; **não devem ser interpretados como fotografia automática da produção atual**.

## Licença

MIT. Veja [LICENSE](LICENSE).
