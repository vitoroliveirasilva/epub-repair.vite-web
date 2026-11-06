# CSP e isolamento do EPUB no Netlify

O app funciona localmente no navegador. O `netlify.toml` define as políticas
HTTP de implantação, e `tests/netlifyCsp99.test.ts` verifica o contrato
mínimo dessas diretivas na CI.

O `script-src 'self'` impede scripts de outros sites; `connect-src 'self'`
restringe comunicação de rede; `object-src 'none'` e `frame-ancestors 'none'`
proíbem a incorporação de conteúdo executável e embutimento de terceiros.

Imagens e vídeos próprios da aplicação podem usar `blob:` e `data:`, sem
autorizar código executável por esses esquemas em `script-src`. A aplicação
não usa `eval`.

**Limites importantes:** esses testes examinam a configuração versionada, não
a resposta HTTP do Netlify em produção. `npm run dev` e `vite preview`
não representam os headers finais do Netlify. O CSP não substitui varredura
do EPUB nem comprova ausência de malware.

Agora `worker-src 'self'` permite exclusivamente Workers com scripts
originados do próprio domínio. O arquivo `src/app/zipLoadWorker.ts` é
empacotado pelo Vite como Worker estático, sem `blob:` em `worker-src`.

A etapa de descompactação acontece no Worker quando suportado. A leitura de
DOM/XML, o reempacotamento e a auditoria final ainda ocorrem no contexto
principal. O suporte real em Safari/iOS e os headers de produção continuam
sujeitos a homologação, inclusive a ausência de `unsafe-eval`.

## Regressão de CSP em browsers (execução 13)

`tests/browser-csp.mjs` aplica o header CSP do `netlify.toml` por
interceptação na página compilada (`vite preview`) em Chromium, Firefox
e WebKit, e verifica script inline bloqueado, conexão remota bloqueada,
raster `data:`/`blob:`, Worker empacotado de mesma origem e download JSON.
A interface eliminou seu `@import` do Google Fonts porque `style-src
'self'` bloqueava o download e contrariava a proposta de execução local.

**Exceção expressamente limitada ao laboratório localhost HTTP:** a diretiva
`upgrade-insecure-requests` permanece no `netlify.toml`, mas é omitida
**somente no header interceptado do harness**, porque converteria os recursos
`http://127.0.0.1` para HTTPS em um servidor local sem TLS. Essa exceção
não significa validação do comportamento do Netlify HTTPS de produção.

### Resultado automático da CI da execução 13

[Run 42149808645](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42149808645)
comprovou o funcionamento de Chromium, Firefox e WebKit no `vite preview`
sob header CSP injetado e política `upgrade-insecure-requests` omitida
somente em localhost HTTP. O app efetivamente carregou Worker, bloqueou
scripts inline e rede remota, mostrou imagens `data:` e `blob:` e
gerou relatório JSON baixável. Esses testes não verificam o servidor
Netlify implantado nem aparelho Safari/iOS real, por isso E-062 é parcial.

## Execução 17: CSP comprovada no Netlify HTTPS real (E-062)

A [CI 42215134060](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42215134060)
foi executada contra o deploy-preview do [PR temporário #31](https://github.com/vitoroliveirasilva/epub-repair.vite-web/pull/31),
com TLS/HTTPS REAL e headers de resposta do Netlify, **sem interceptar ou
simular o header**. Evidências do job:

- `Content-Security-Policy` devolvida pelo Netlify igual à declarada na
  `netlify.toml` da `dev`, com `worker-src 'self'`;
- HSTS `max-age=31536000; includeSubDomains; preload`, `nosniff`,
  `X-Frame-Options: DENY`;
- scripts inline e `connect-src` externos bloqueados pelo navegador,
  imagens passivas `data:` e `blob:` funcionando;
- download JSON e upload/reparo/download de EPUB 12 MiB com três Workers
  reais e verificação ZIP posterior.

A versão implantada foi a **`dev` em deploy-preview**, não produção.
O PR foi **fechado sem merge** após o teste. Com isso E-062 atende ao
critério de verificação **em hospedagem efetiva** sem quebrar a política
de preservar produção.

Cuidado: `netlify.toml` da versão antiga em `prod` ainda declara
`worker-src 'none'`, coerente com a versão v2.2.0. Para lançar
o novo código em produção, a atualização de CSP deve acompanhar a
publicação, com a aprovação do fluxo de release.
