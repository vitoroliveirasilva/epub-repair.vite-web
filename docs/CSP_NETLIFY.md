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

No momento `worker-src 'none'` bloqueia Workers por projeto. Quando o
worker de análise assíncrona (E-032) for implementado, a CSP terá de ser
revisada junto com teste em navegador real para permitir apenas Workers
estáticos originados do próprio domínio.
