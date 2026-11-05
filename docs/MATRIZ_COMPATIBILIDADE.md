# Matriz de formatos e validação

A ferramenta tem foco em reparos **conservadores e verificáveis** de EPUB 2 e EPUB 3.
A execução de EPUBCheck no CI valida uma fixture gerada pelo motor, não todos os
livros nem todos os recursos possíveis das especificações.

| Perfil / recurso | Leitura no app | Reparos automáticos | Validação externa |
| --- | --- | --- | --- |
| EPUB 2.0/2.0.1 | ZIP, OPF, spine, NCX, imagens, CSS | MIME, container, manifest, NCX ausente quando há destinos válidos | EPUBCheck 5.4.0 no CI, ampliar corpus EPUB2 |
| EPUB 3.0/3.2 | OPF 3, nav.xhtml, XHTML, fontes e recursos externos | Ajustes estruturais, nav básico quando ausente | Uma fixture EPUB 3 reparada passa no CI |
| EPUB 3.3 | Funcionalidades básicas | Reparo conservador sem converter a edição | Validar novas regras oficiais caso a caso |
| EPUB 3.4 | Pacote EPUB3 reconhecido; sem suporte completo às novidades | Não presumir cobertura de novos recursos | EPUBCheck 5.4.0 verifica pelas regras EPUB 3.4 |
| Fontes externas HTTP/HTTPS | Permitidas por padrão | Não remover sem solicitação | Leitura offline depende da fonte |
| JPEG progressivo | Diagnóstico opcional | Conversão somente com opt-in de otimização | Depende do navegador |
| Scripts EPUB 3, SMIL, Media Overlays | Diagnóstico parcial | Não prometer restauração de interatividade | Requer testes específicos e manual |
| Fixed-layout, SVG complexo, MathML e RTL | Suporte básico estrutural | Nenhuma transformação editorial implícita | Necessita corpus, EPUBCheck e inspeção visual |
| Kindle/Calibre/leitores móveis | Compatibilidade estimada, não certificada | Técnicas de compatibilidade comuns | Não existe matriz real completa de dispositivos |

## Qualidade comprovada por CI

- `npm ci`, typecheck, lint, testes sintéticos e build em Node.js 20/22.
- EPUBCheck **5.4.0**, obtido do projeto W3C por release com checksum SHA-256.
- Um EPUB3 intencionalmente inválido sem `mimetype` é reparado pelo motor e
  a cópia resultante é validada pelo EPUBCheck.
- A operação idempotente é testada: um segundo reparo sem pendências não altera o EPUB.

## Limites pendentes

- EPUBCheck precisa validar mais fixtures reais sintetizadas, com EPUB2, foreign resources,
  navegação complexa e mídia sincronizada.
- Validação em Chromium, Firefox, WebKit, Kindle Previewer e Calibre ainda precisa ocorrer.
- O site estático **não** executa EPUBCheck Java no navegador.
- Conformidade oficial não substitui revisão editorial, teste visual nem antivírus.

Referências:
- https://www.w3.org/TR/epub-33/
- https://www.w3.org/TR/epub-34/
- https://github.com/w3c/epubcheck/releases/tag/v5.4.0
