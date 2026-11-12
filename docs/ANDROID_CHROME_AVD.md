# Android 15 Chrome: automação real do SO em emulador, não hardware

> **Atualização 12/11/2026:** a automação AVD abaixo valida o fluxo do **reparador EPUB** em emulador. A rota nova `/converter` e a navegação móvel receberam smoke em Chromium/Firefox/WebKit desktop com viewport móvel, mas não há aqui evidência de conversão PDF + OCR em hardware Android físico. Não marcar E-089 como concluído apenas por emulação. Ver [Homologação física](HOMOLOGACAO_MOBILE_REAL.md).


O workflow `.github/workflows/android-emulator.yml` inicializa uma
imagem Android **15 / API 35, Google Play Store, Pixel 7** no runner
Linux com KVM, usa o **Chrome realmente instalado na imagem**,
liga por Playwright Android experimental via ADB e abre o bundle
`vite preview` através de `adb reverse`. A suíte:

- confere versão/modelo e reporta viewport, user-agent Android e touch;
- abre a aplicação e envia EPUB de teste sintético via seletor;
- analisa e repara o EPUB de verdade, com Worker quando suportado;
- aciona download do arquivo novo no Chrome para Android;
- usa ADB para localizar o EPUB baixado em `/sdcard/Download`,
  copia o arquivo e valida o ZIP/mimetype e texto original;
- grava screenshot e JSON de evidência como artifacts temporários de CI.

Isso é uma checagem de **Chrome executando sob Android real dentro
do AVD**, superior a apenas mudar viewport no Chrome desktop.
Mas **não é smartphone físico**, não cobre Safari iOS, navegador
Samsung Internet ou condições de memória e permissões reais de
todos os modelos. E-089 permanece parcial até homologar em celular.

Playwright Android é API experimental, portanto falhas no harness,
permissões de seletor de arquivos ou Play Store não são, sozinhas,
evidência de defeito no motor do EPUB Repair.
