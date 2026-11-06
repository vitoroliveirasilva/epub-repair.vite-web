import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const source = process.env.PLAYWRIGHT_MODULE;
assert.ok(source, 'PLAYWRIGHT_MODULE precisa existir');
const engines = await import(pathToFileURL(source).href);
const selected = process.env.BROWSER ?? 'chromium';
const engine = engines[selected];
assert.ok(engine, 'Motor browser não encontrado ' + selected);

function pseudoRandom(length) {
  const bytes=new Uint8Array(length);
  let seed=0x6f24d391;
  for(let i=0;i<length;i++){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    bytes[i]=seed&255;
  }
  return bytes;
}
async function largeEpub() {
  const zip=new JSZip();
  // Mimetype ausente: o app deve executar reparo e reempacotamento efetivos.
  zip.file('META-INF/container.xml',
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/>' +
    '</rootfiles></container>');
  zip.file('OPS/book.opf',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:large-real-browser</dc:identifier>' +
    '<dc:title>Teste do Worker</dc:title><dc:language>pt-BR</dc:language>' +
    '<meta property="dcterms:modified">2026-11-06T11:00:00Z</meta>' +
    '</metadata><manifest>' +
    '<item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>' +
    '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="data" href="data.bin" media-type="application/octet-stream"/>' +
    '</manifest><spine><itemref idref="chapter"/></spine></package>');
  zip.file('OPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
    '<head><title>Sumário</title></head><body><nav epub:type="toc">' +
    '<ol><li><a href="chapter.xhtml">Capítulo</a></li></ol></nav></body></html>');
  zip.file('OPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Capítulo</title></head>' +
    '<body><h1>Leitura real de EPUB grande</h1><p>Persistir o conteúdo.</p></body></html>');
  zip.file('OPS/data.bin', pseudoRandom(12*1024*1024),{compression:'DEFLATE'});
  return Buffer.from(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}));
}

const browser=await engine.launch({headless:true});
try{
  const context=await browser.newContext({
    viewport:{width:390,height:844},
    ...(selected!=='firefox'?{isMobile:true,deviceScaleFactor:2,hasTouch:true}:{}),
    acceptDownloads:true,
  });
  const page=await context.newPage();
  const errors=[];
  const workers=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('worker',worker=>workers.push(worker.url()));
  page.on('dialog',dialog=>{void dialog.accept()});
  try {
    const bytes=await largeEpub();
    await page.goto('http://127.0.0.1:5173/',{waitUntil:'load'});
    await page.locator('#epub-file-input').setInputFiles({
      name:'large-browser.epub',mimeType:'application/epub+zip',buffer:bytes,
    });
    await page.getByRole('button',{name:'Gerar EPUB corrigido'})
      .waitFor({state:'visible',timeout:60000});
    const button=page.getByRole('button',{name:'Gerar EPUB corrigido'});
    await button.click();
    await page.getByRole('button',{name:'Baixar EPUB corrigido'})
      .waitFor({state:'visible',timeout:60000});
    const [download]=await Promise.all([
      page.waitForEvent('download',{timeout:20000}),
      page.getByRole('button',{name:'Baixar EPUB corrigido'}).click(),
    ]);
    const result=await readFile(await download.path());
    const epub=await JSZip.loadAsync(result);
    assert.equal(await epub.file('mimetype')?.async('string'),'application/epub+zip');
    assert.equal((await epub.file('OPS/data.bin')?.async('uint8array')).length,
      12*1024*1024);
    assert.match(await epub.file('OPS/chapter.xhtml')?.async('string'),
      /Leitura real de EPUB grande/u);
    assert.ok(workers.length>=3,
      'Esperados Workers de extração (duas análises) e recompactação real; vistos '+
      workers.length+' '+workers.join(','));
    assert.deepEqual(errors,[],'Falha de runtime em '+selected);
    console.log('PASS E-032/E-080/E-089 browser='+selected+
      ' mobileViewport=true bytes='+bytes.length+' repaired='+result.length+
      ' workers='+workers.length);
  }finally{
    await context.close();
  }
}finally{
  await browser.close();
}
