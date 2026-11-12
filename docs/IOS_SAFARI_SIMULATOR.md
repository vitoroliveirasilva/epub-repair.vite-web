# Safari/iOS nativo no Xcode Simulator: resultado é simulação, não iPhone físico

> **Atualização 12/11/2026:** este documento é sobre a automação Safari no **iOS Simulator**, não sobre iPhone físico. O menu móvel e o conversor PDF existem em produção, mas a suíte aqui descrita não comprova download/abertura do EPUB convertido nesses dispositivos. E-082 exige evidência de hardware real. Ver [Homologação física](HOMOLOGACAO_MOBILE_REAL.md).


`.github/workflows/ios-simulator.yml` instala Appium 3.8.0 e
XCUITest 12.22.0 no runner macOS, inicializa um iPhone Simulator
via Xcode, abre o **Safari nativo do SO iOS** e navega para o bundle
compilado do EPUB Repair usando localhost.

A suíte `tests/ios-safari-simulator.mjs` envia bytes de um EPUB sintético
por `File/DataTransfer` no próprio Safari, aguarda UI de análise,
aciona reparo e solicita download por WebDriver/WDA. Tenta identificar
o arquivo `.epub` efetivamente gravado no sandbox do iOS Simulator.
Seu resultado expõe evidência JSON e screenshot; **não declara
download validado quando só o clique foi confirmado**.

Se a automação do Safari iOS não disponibilizar o arquivo de download
via sandbox, o teste falha com motivo claro. O resultado é uma medida
de compatibilidade do **iOS Simulator**, que utiliza o WebKit nativo,
mas **não cobre todos os detalhes** de permissão, memória, ação do
usuário ou Files de um iPhone/iPad físico.

O E-082 permanece parcial até confirmar o download no Safari do
dispositivo físico, bem como liberação de ObjectURL e integridade.
