# Deploy, publicação e operação

**Referência:** configuração de 12/11/2026. A versão `v3.0.0` consolida as alterações após `v2.5.0`. A nova tag é publicada pelo workflow após CI bem-sucedida em `prod`, sem exigir uma tag nova a cada PR.

## Ambientes

| Ambiente | Referência | Uso |
| --- | --- | --- |
| Desenvolvimento local | `npm run dev`, porta `5173` | Iteração rápida, não reproduz cabeçalhos HTTPS da hospedagem. |
| Preview local | `npm run build && npm run preview`, porta `4173` | Inspeção do bundle compilado. |
| Branch `dev` | GitHub, opcionalmente deploy-preview da Netlify | Desenvolvimento e revisão sem promover código a produção. |
| PR `dev` → `prod` | GitHub + checks + deploy-preview | Homologação do HEAD exato candidato. |
| Produção | `prod`, https://epubrepair.netlify.app/ | Site público implantado pela Netlify. |

Não colocar tokens, credenciais, arquivos de clientes nem livros privados em variáveis expostas pelo frontend. A aplicação é estática.

## Build na Netlify

`netlify.toml` define:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"
  NPM_FLAGS = "--include=dev"
```

O `vite.config.ts` também inclui arquivos de OCR em `dist/ocr/`. Não eliminar esses assets em um pipeline que aparente funcionar apenas com PDF de texto nativo: páginas escaneadas dependem deles.

A regra `/* → /index.html` com status 200 permite abrir diretamente `/converter` e atualizar a página sem erro 404.

## Segurança HTTP, CSP e cache

O arquivo **real versionado** `netlify.toml` declara, entre outras, as diretivas:

| Cabeçalho | Valor ou finalidade |
| --- | --- |
| `Content-Security-Policy` | `default-src 'none'`, `script-src 'self'`, `connect-src 'self'`, `worker-src 'self'`; imagens/mídia local permitem `data:`/`blob:` conforme contexto. |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` / `frame-ancestors` | Bloqueio de incorporação por terceiros. |
| `Strict-Transport-Security` | `max-age=31536000`. **Não** afirmar `includeSubDomains` ou `preload` sem verificar o valor atual. |
| `Referrer-Policy` | `strict-origin-when-cross-origin`. |
| `Permissions-Policy` | Câmera, microfone, geolocalização e pagamento desabilitados na resposta. |
| `Cache-Control` da página | `no-cache, max-age=0, must-revalidate`: permite revalidar o HTML. |
| `Cache-Control` de `/assets/*` | `public, max-age=31536000, immutable`: assets versionados por nome/hash. |

Essas configurações exigem conferência da **resposta HTTPS da produção** após cada mudança de deploy. O navegador local ou `vite preview` não prova o header entregue pela Netlify. Veja [CSP e isolamento](CSP_NETLIFY.md).

## Fluxo de promoção

1. Implementar e documentar na `dev`.
2. Revisar alterações com testes pertinentes. Evitar pushes de correções minúsculas em série.
3. Abrir PR não draft `dev` → `prod` quando candidata pronta para homologação.
4. Exigir aprovação dos checks realmente obrigatórios do ruleset (`Quality gate / Node 20.x` e `Quality gate / Node 22.x` conforme auditoria), além de analisar **EPUBCheck, browsers, cobertura, Calibre e preview** quando executados/relevantes.
5. Revisar conteúdo funcional e diff, então realizar merge autorizado, sem force-push.
6. Acompanhar o novo commit da `prod`, CI e deploy de produção até `ready`. Confirmar pelo menos as duas URLs e os assets `/ocr` se a alteração atingir OCR.
7. Quando ocorrer alteração de versão, registrar `package.json`, `package-lock.json`, notas de release e tag de maneira coerente.

Não assumir que um PR com “mergeable: true” passou todos os checks; conferir conclusões e SHA exatos. Não declarar deploy concluído enquanto a Netlify estiver em `building` ou `queued`.

## Versionamento e releases

`.github/workflows/release.yml` reage a **CI bem-sucedida após push em `prod`**. Ele:

- valida se `package.json`, `package-lock.json` e `packages[""].version` possuem a mesma versão SemVer estável;
- verifica se o SHA validado continua como HEAD da `prod`;
- consulta se a tag da mesma versão já possui release e não republica se existir;
- usa `.github/release-notes/vX.Y.Z.md` quando disponível.

**Consequência:** merges subsequentes mantendo `3.0.0` podem atualizar o site sem gerar outra GitHub Release. O conteúdo de uma release datada é histórico; o HEAD de produção pode ser mais recente. Só incrementar versão se essa for uma decisão explícita de publicação versionada.

## Verificação pós-deploy

- Abrir `/` e `/converter` diretamente e após refresh.
- Navegar entre as ferramentas pelo menu móvel; verificar drawer de tela inteira, fechamento X/Escape, foco, temas e footer de quatro links.
- Fazer upload e relatório de EPUB sintético, com validação e download quando houver correção real.
- Fazer PDF sintético de texto e, se a alteração envolver OCR, um PDF com página digitalizada; conferir geração e download.
- Verificar CSP/Workers e ausência de requisições externas inesperadas contendo conteúdo do arquivo.
- Conferir log de deploy e URL do deploy imutável; não confundir preview com site público.

## Incidentes e reversão

Em falha após deploy, registrar SHA, hora, URL, captura, navegador, passos e resposta HTTP. Preferir **rollback do deploy na plataforma** ou **reversão por novo commit/PR** conforme política operacional; não forçar histórico de `prod` nem sobrescrever tags. Uma eventual reversão da produção **não apaga** automaticamente commits ou releases históricos.

## Boas práticas de custo e segurança

- Unificar mudanças na `dev` antes de CI completa.
- Não disparar iOS/Android/Kindle sem necessidade real; são suites complementares.
- Nunca utilizar um teste de fixture para atestar correção universal de PDFs/EPUBs privados.
- Não publicar downloads de livros nem capturas de conteúdo protegido nos artefatos públicos de CI.
- Distinguir `CI verde`, `merge concluído`, `deploy pronto` e `homologação editorial/física`; são estados diferentes.

Referências: [CI econômica](CI_ECONOMICO.md), [Política de branches](BRANCH_POLICY.md), [Política de tags](BRANCH_TAG_POLICY.md), [Qualidade](QUALIDADE_TESTES.md), [Matriz de dispositivos](HOMOLOGACAO_MOBILE_REAL.md).
