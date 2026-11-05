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
