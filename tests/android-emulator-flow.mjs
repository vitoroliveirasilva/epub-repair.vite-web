import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * E-089: Android OS + Chrome reais em um EMULADOR Google APIs/Play Store,
 * NÃO dispositivo físico. Usa ADB e a automação Android experimental Playwright.
 */
const playwrightFile = process.env.PLAYWRIGHT_MODULE;
assert.ok(playwrightFile, 'PLAYWRIGHT_MODULE ausente');
const { chromium } = await import(pathToFileURL(playwrightFile).href);
function adb(...args) {
  return execFileSync('adb', args, {
    encoding: 'utf8', timeout: 20_000,
  }).trim();
}
function makeEpub() {
  const zip = new JSZip();
  zip.file('META-INF/container.xml',
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" ' +
    'media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OPS/book.opf',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:android-test</dc:identifier>' +
    '<dc:title>Android real browser test</dc:title>' +
    '<dc:language>pt-BR</dc:language>' +
    '<meta property="dcterms:modified">2026-11-06T12:00:00Z</meta>' +
    '</metadata><manifest>' +
    '<item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>' +
    '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
    '</manifest><spine><itemref idref="chapter"/></spine></package>');
  zip.file('OPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
    '<head><title>Índice</title></head><body><nav epub:type="toc"><ol>' +
    '<li><a href="chapter.xhtml">Capítulo Android</a></li></ol></nav></body></html>');
  zip.file('OPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Android</title></head>' +
    '<body><h1>Android Chrome</h1>' +
    '<p>O texto precisa ser preservado no aparelho.</p></body></html>');
  return zip.generateAsync({ type:'uint8array', compression:'DEFLATE' });
}
const version=adb('shell','getprop','ro.build.version.release');
const model=adb('shell','getprop','ro.product.model');
console.log('Android AVD:',model,'OS:',version);
const errors=[];
const workers=[];
let browser;
try {
  // Playwright._android.launchBrowser() requer flag manual
  // "Enable command line on non-rooted devices" e bloqueava o runner.
  // Conectamos ao Chrome Android verdadeiro pelo CDP oficial via ADB.
  console.log('Starting Chrome via Android activity...');
  adb('shell','am','force-stop','com.android.chrome');
  adb('shell','am','start','-a','android.intent.action.VIEW','-d',
    'http://127.0.0.1:5173/','com.android.chrome');
  // Play Store builds differ in socket naming. Probe the *actual* Android
  // Unix sockets; never pretend a desktop Chromium instance is Android.
  const availableSockets = new Set(['chrome_devtools_remote']);
  try {
    for (const name of adb('shell','cat','/proc/net/unix')
      .matchAll(/@((?:chrome|webview)_devtools_remote[^\s]*)/gu)) {
      availableSockets.add(name[1]);
    }
  } catch { /* /proc may be restricted on newer Google Play images */ }
  console.log('Android devtools socket candidates:', [...availableSockets]);
  let versionInfo;
  let connectedSocket;
  for (const socket of availableSockets) {
    try {
      adb('forward','--remove','tcp:9222');
    } catch { /* no previous forward */ }
    try { adb('forward','tcp:9222','localabstract:'+socket); }
    catch { continue; }
    for (let tries=0;tries<8;tries++){
      try {
        const response=await fetch('http://127.0.0.1:9222/json/version',
          {signal:AbortSignal.timeout(1500)});
        if(response.ok) {
          const candidate=await response.json();
          if(candidate?.webSocketDebuggerUrl &&
              /Chrome|Chromium/iu.test(candidate.Browser??'')){
            versionInfo=candidate;connectedSocket=socket;break;
          }
        }
      }catch{ /* socket not ready */ }
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    if(versionInfo) break;
  }
  if(!versionInfo){
    console.error('Chrome Android CDP indisponível. Diagnóstico: '+
      adb('shell','dumpsys','activity','activities').slice(-2500));
    try {
      const snap=execFileSync('adb',['exec-out','screencap','-p'],
        {timeout:10000});
      await writeFile(join(process.env.RUNNER_TEMP??'.',
        'android-mobile-web.png'),snap);
    }catch{ /* screenshot diagnostic only */ }
  }
  assert.ok(versionInfo?.webSocketDebuggerUrl,
    'Chrome Android não expôs endpoint CDP (nenhum socket funcional). '+ 
    'Verificar Chrome first-run, developer debugging ou imagem Android AVD');
  console.log('Android CDP socket escolhido:',connectedSocket);
  console.log('Chrome Android CDP:',versionInfo.Browser);
  browser=await chromium.connectOverCDP('http://127.0.0.1:9222',
    {timeout:30000});
  const context=browser.contexts()[0];
  assert.ok(context,'CDP Android não disponibilizou contexto');
  const page=context.pages()[0]??await context.newPage();
  page.on('pageerror',(error)=>errors.push(error.message));
  page.on('worker',(worker)=>workers.push(worker.url()));
  page.setDefaultTimeout(45_000);
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
  assert.match(await page.title(),/EPUB/u);
  const viewport=await page.evaluate(() => ({
    width:window.innerWidth,
    height:window.innerHeight,
    touch: navigator.maxTouchPoints,
    userAgent:navigator.userAgent,
  }));
  assert.ok(viewport.width < 1000, 'Viewport não é mobile: ' + viewport.width);
  assert.ok(viewport.touch > 0, 'Android não reporta touch nativo');
  assert.match(viewport.userAgent, /Android/u);
  const bytes=await makeEpub();
  // Arquivo construído dentro do Chrome Android, sem transferência de
  // file chooser cujo suporte CDP no Android varia entre builds.
  const upload=await page.evaluate((base64)=>{
    const bytes=Uint8Array.from(atob(base64),ch=>ch.charCodeAt(0));
    const file=new File([bytes],'android-test.epub',
      {type:'application/epub+zip'});
    const dt=new DataTransfer();
    dt.items.add(file);
    const input=document.querySelector('#epub-file-input');
    if(!(input instanceof HTMLInputElement)) return {count:0};
    input.files=dt.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
    return {count:input.files.length,size:input.files[0]?.size};
  },Buffer.from(bytes).toString('base64'));
  assert.equal(upload.count,1);
  assert.equal(upload.size,bytes.length);
  const repair=page.getByRole('button',{name:'Gerar EPUB corrigido'});
  await repair.waitFor({state:'visible',timeout:120_000});
  await repair.click();
  const download=page.getByRole('button',{name:'Baixar EPUB corrigido'});
  await download.waitFor({state:'visible',timeout:120_000});
  await download.click();
  const dirname=await mkdtemp(join(tmpdir(),'epub-android-'));
  try {
    let file;
    for (let tries=0;tries<40;tries++){
      const filenames=adb('shell','ls','-1','/sdcard/Download').split('\n')
        .map(x=>x.trim()).filter(x=>/\.epub$/iu.test(x));
      if (filenames.length){file=filenames[0];break;}
      await new Promise((resolve)=>setTimeout(resolve,1000));
    }
    assert.ok(file, 'Chrome Android não salvou o EPUB em /sdcard/Download');
    const local=join(dirname,'android-output.epub');
    adb('pull','/sdcard/Download/'+file,local);
    const output=await readFile(local);
    assert.ok(output.length>200, 'Download Android vazio ou truncado');
    const zip=await JSZip.loadAsync(output);
    assert.equal(await zip.file('mimetype')?.async('string'),'application/epub+zip');
    assert.match(await zip.file('OPS/chapter.xhtml')?.async('string'),
      /O texto precisa ser preservado no aparelho/u);
    assert.equal(errors.length,0,errors.join('; '));
    console.log('PASS E-089 Android Chrome AVD',model,version,
      'viewport',JSON.stringify(viewport),'download',output.length,
      'workerCount',workers.length);
    await page.screenshot({path:join(process.env.RUNNER_TEMP??dirname,
      'android-mobile-web.png')});
    await writeFile(join(process.env.RUNNER_TEMP??dirname,
      'android-mobile-evidence.json'),JSON.stringify({
        model, version, viewport, workers:workers.length,
        downloadBytes:output.length, downloadedFile:file,
        physicalDevice:false,
      },null,2));
  } finally {
    await rm(dirname,{recursive:true,force:true});
  }
} finally {
  await browser?.close();
  try{adb('forward','--remove','tcp:9222')}catch{/* cleanup */}
}
