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
