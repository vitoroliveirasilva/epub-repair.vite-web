# Homologação real em iPhone/iPad e Android (E-082 e E-089)

Estas verificações precisam ser feitas em **hardware físico**.
WebKit Linux, Chromium com viewport de celular, Playwright e
Xcode Simulator **não são prova** do comportamento em dispositivos
reais. Não alterar o status dos itens sem evidência capturada.

## Preparação

A CI `.github/workflows/ci.yml` publica o artifact
`epub-manual-device-fixtures` com livros **sintéticos**, sem conteúdo
protegido de terceiros. Inclui EPUB 2, EPUB 3, sumário NCX hierárquico
e exemplos reflowable/fixed. Faça download do artifact no GitHub Actions
e extraia os arquivos no dispositivo, ou disponibilize-os por canal seguro.

Use a URL do **deploy de homologação da dev**, nunca a produção v2.3.0
para avaliar alterações que ainda não foram integradas. Registre o SHA
exato servido pelo deploy de homologação e confirme a CSP hospedada.

## Safari no iPhone e iPad (E-082)

- Abrir a URL HTTPS no **Safari nativo**. Registrar modelo, iOS/iPadOS
  e versão de Safari.
- Fazer upload de um EPUB sintético pelo seletor Files, sem compartilhar
  nenhum livro privado com serviços externos.
- Verificar e corrigir um arquivo com problema OCF. Aguardar o
  botão de download e salvar a cópia gerada em **Arquivos**.
- Conferir que o arquivo salvo tem **tamanho não zero**, nome
  correto, é ZIP/EPUB abrível e preserva o texto e a ilustração
  original; testar também um EPUB 2 e a capa.
- Baixar TXT/JSON e confirmar que funcionam sem bloqueio de
  blob URL. Testar download repetido e navegação `pagehide`,
  sem duplicação e sem downloads vazios.
- Abrir a saída em Apple Books e verificar visualmente reflowable,
  fixed-layout, tipografia, sumário, SVG e imagens.

## Android com Chrome e Firefox (E-089)

- Repetir upload, análise, reparo e download em hardware Android
  físico, nas versões identificadas de Chrome e Firefox.
- Testar modo retrato/paisagem, acessibilidade dos botões, fila de
  tarefas, cancelamento no meio da extração e download final.
- Conferir integridade e abrir EPUB de saída num leitor instalado,
  comparando texto, sumário, SVG e renderização de layout fixo.

## Critérios para fechamento

Os dois itens só podem ser encerrados quando a matriz incluir,
para cada plataforma, **data, modelo, versão do SO, navegador, SHA
de deploy, arquivo de teste, resultado do download e evidência**
(captura de tela e hash ou tamanho do arquivo).
Falhas devem gerar issue/bug com passos de reprodução.

A suíte automatizada existente no Linux desktop/viewport móvel
é evidência complementar, não substitui os testes acima.

## Ambiente histórico de homologação em 06/11/2026 (não é o candidato atual)

Os links abaixo registram ensaios anteriores e **não devem ser usados para
aprovar a candidata v2.4.0**. Para ela, usar o deploy HTTPS referente
à nova PR de homologação e verificar que ele serve o SHA exato do candidato.

A homologação em hardware real continua pendente até evidências dos
dispositivos E-082/E-089, mesmo que emuladores ou browsers automatizados passem.

- [Abrir versão de desenvolvimento no Netlify HTTPS](https://6aeddf74dc6a8c922d462128--epubrepair.netlify.app/).
  **Não é produção**. O deploy passou na CI de CSP e Workers
  [42231322872](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42231322872).
- [PR histórica #32 (encerrada sem merge)](https://github.com/vitoroliveirasilva/epub-repair.vite-web/pull/32),
  originou o preview anterior; não é a candidata v2.4.0 e não
  autoriza promoção para `prod`.
- [EPUBs de teste na CI dev 42231064719](https://github.com/vitoroliveirasilva/epub-repair.vite-web/actions/runs/42231064719),
  artifact `epub-manual-device-fixtures`: cinco arquivos EPUB 2/3,
  navegação NCX, reflowable e fixed-layout. Nenhum livro privado.
- Depois de cada teste, confirmar em *Arquivos* (iOS) ou *Downloads*
  (Android) que o arquivo **tem tamanho positivo e abre em leitor**.
  Captura de tela só da interface não prova download bem sucedido.

A suíte nativa automatizada usa Android 15 AVD/Chrome e iOS Xcode
Simulator/Safari, mas esses resultados **não substituem** testes em
aparelhos físicos. Manter E-082/E-089 parciais até evidência real.
