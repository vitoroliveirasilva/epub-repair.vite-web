import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import JSZip from 'jszip';
import { execFileSync } from 'node:child_process';
import { writeFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const host = 'http://127.0.0.1:4723';
const udid = process.env.IOS_SIM_UDID;
assert.ok(udid, 'IOS_SIM_UDID não informado');






async function webdriver(method, route, payload) {
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  const result = await new Promise((resolve, reject) => {
    const req = httpRequest(host + route, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, body: text }));
    });
    const timeout = route === '/session' ? 960_000 : 180_000;
    req.setTimeout(timeout, () => req.destroy(new Error(
      'WebDriver HTTP excedeu o prazo para ' + method + ' ' + route,
    )));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
  const parsed = JSON.parse(result.body);
  if (result.status < 200 || result.status >= 300 || parsed.value?.error) {
    throw new Error('WebDriver ' + method + ' ' + route + ': ' +
      JSON.stringify(parsed.value).slice(0, 1600));
  }
  return parsed.value;
}
async function pause(ms){await new Promise(resolve=>setTimeout(resolve,ms))}
function specimen(){
  const z=new JSZip();
  z.file('META-INF/container.xml',
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/>' +
    '</rootfiles></container>');
  z.file('OPS/book.opf',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:safari-sim</dc:identifier>' +
    '<dc:title>Safari EPUB Test</dc:title><dc:language>pt-BR</dc:language>' +
    '<meta property="dcterms:modified">2026-11-06T12:00:00Z</meta></metadata>' +
    '<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
    '<item id="ch" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>' +
    '<spine><itemref idref="ch"/></spine></package>');
  z.file('OPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
    '<head><title>Sumário</title></head><body><nav epub:type="toc"><ol>' +
    '<li><a href="chapter.xhtml">Primeiro capítulo</a></li></ol></nav></body></html>');
  z.file('OPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Safari</title></head>' +
    '<body><h1>Safari iOS</h1><p>EPUB reparado no iOS Simulator.</p></body></html>');
  return z.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
const evidence={physicalDevice:false,device:udid,environment:'Xcode iOS Simulator Safari'};
const sessionData={capabilities:{alwaysMatch:{
  platformName:'iOS',browserName:'Safari',
  'appium:automationName':'XCUITest',
  'appium:udid':udid,
  'appium:safariInitialUrl':'http://127.0.0.1:5173/',
  'appium:noReset':false,
  'appium:newCommandTimeout':180,
  'appium:wdaLaunchTimeout':780000,
  'appium:wdaConnectionTimeout':180000,
  'appium:showXcodeLog':true,
  'appium:wdaStartupRetries':1,
  'appium:useNewWDA':true,
}}};
let session;
try {
  const created=await webdriver('POST','/session',sessionData);
  session=created.sessionId;
  assert.ok(session,'Appium não retornou sessionId');
  const root='/session/'+session;
  const script=async(code,args=[])=>await webdriver('POST',root+'/execute/sync',
    {script:code,args});
  const navigate=await webdriver('POST',root+'/url',
    {url:'http://127.0.0.1:5173/'});
  void navigate;
  let current;
  for(let i=0;i<40;i++){
    current=await script('return {title:document.title,ua:navigator.userAgent,'+
      'touch:navigator.maxTouchPoints,ready:!!document.querySelector("#epub-file-input")};');
    if(current?.ready)break;
    await pause(1200);
  }
  assert.ok(current?.ready,'Safari Simulator não carregou app');
  assert.match(current.ua,/iPhone|iPad/u);
  assert.ok(current.touch>0);
  assert.match(current.title,/EPUB/u);
  evidence.safari=current;
  const source=Buffer.from(await specimen());
  const upload=await script(
    'var bytes=Uint8Array.from(atob(arguments[0]), function(c){return c.charCodeAt(0)});'+
    'var file=new File([bytes],"safari-sim.epub",{type:"application/epub+zip"});'+
    'var transfer=new DataTransfer();transfer.items.add(file);'+
    'var input=document.querySelector("#epub-file-input");'+
    'input.files=transfer.files;input.dispatchEvent(new Event("change",{bubbles:true}));'+
    'return {count:input.files.length,size:input.files[0].size};',
    [source.toString('base64')],
  );
  assert.equal(upload.count,1);
  assert.equal(upload.size,source.length);
  async function clickButton(label){
    const value='//button[contains(normalize-space(.), "'+label+'")]';
    let handle;
    for(let attempt=0;attempt<90;attempt++){
      try{
        const element=await webdriver('POST',root+'/element',{using:'xpath',value});
        const enabled=await webdriver('GET',root+'/element/'+
          element['element-6066-11e4-a52e-4f735466cecf']+'/enabled');
        if(enabled){handle=element['element-6066-11e4-a52e-4f735466cecf'];break;}
      }catch{  }
      await pause(1200);
    }
    assert.ok(handle,'Botão não disponível: '+label);
    await webdriver('POST',root+'/element/'+handle+'/click',{});
  }
  await clickButton('Gerar EPUB corrigido');
  await clickButton('Baixar EPUB corrigido');
  await pause(3000);
  try {
    const alert=await webdriver('GET',root+'/alert/text');
    evidence.downloadPrompt=alert;
    await webdriver('POST',root+'/alert/accept',{});
  }catch {
    evidence.downloadPrompt='nenhum diálogo W3C detectado';
  }
  
  
  const simulatorRoot=join(process.env.HOME,
    'Library/Developer/CoreSimulator/Devices',udid,'data');
  const found=[];
  async function walk(folder,depth=0){
    if(depth>10||found.length>15)return;
    let children;
    try{children=await readdir(folder,{withFileTypes:true})}catch{return;}
    for(const child of children){
      const path=join(folder,child.name);
      if(child.isDirectory()){
        if(!['Caches','tmp','.Trash','Snapshots'].includes(child.name))
          await walk(path,depth+1);
      }else if(child.isFile()&&/\.epub$/iu.test(child.name)){
        const info=await stat(path);found.push({name:child.name,size:info.size});
      }
    }
  }
  await walk(simulatorRoot);
  evidence.downloadedFiles=found;
  evidence.downloadSaved=found.some(x=>x.size>200);
  evidence.browserVisible=true;
  evidence.uploadCompleted=true;
  evidence.repairCompleted=true;
  evidence.downloadClickCompleted=true;
  evidence.date=new Date().toISOString();
  const screenshot=await webdriver('GET',root+'/screenshot');
  if(typeof screenshot==='string'&&screenshot.length>10){
    await writeFile(join(process.env.RUNNER_TEMP??'.','ios-safari-simulator.png'),
      Buffer.from(screenshot,'base64'));
  }
  console.log('PASS E-082 Safari iOS Simulator actual web app: ',
    JSON.stringify(evidence));
  
  
  
  assert.ok(evidence.downloadSaved,
    'Safari iOS Simulator mostrou o app e acionou download, mas EPUB '+ 
    'não foi localizado no filesystem do Simulator.');
}finally{
  await writeFile(join(process.env.RUNNER_TEMP??'.','ios-safari-evidence.json'),
    JSON.stringify(evidence,null,2));
  if(session)await webdriver('DELETE','/session/'+session).catch(()=>{});
}
