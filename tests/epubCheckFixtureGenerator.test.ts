
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { repairEpub } from '../src/epub/repair/repairEpub';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';
import { buildEpubFromPdf } from '../src/converter/buildEpub';
import type { ConverterOptions, PdfAnalysisResult } from '../src/converter/model';

beforeAll(() => {
  
  if (typeof Blob.prototype.arrayBuffer === 'function') return;
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error(reader.error?.message ?? 'Blob ilegível.'));
      reader.readAsArrayBuffer(this);
    });
  };
});

function createInvalidEpub(): Promise<Uint8Array> {
  const zip = new JSZip();
  
  zip.file('META-INF/container.xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/>' +
    '</rootfiles></container>');
  zip.file('OPS/book.opf',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:18a66eae-76b5-42ab-a892-ff1f553d0cbd</dc:identifier>' +
    '<dc:title>Fixture EPUBCheck</dc:title><dc:language>pt-BR</dc:language>' +
    '<meta property="dcterms:modified">2026-11-05T12:00:00Z</meta>' +
    '</metadata><manifest>' +
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
    '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
    '</manifest><spine><itemref idref="chapter"/></spine></package>');
  zip.file('OPS/nav.xhtml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" ' +
    'lang="pt-BR" xml:lang="pt-BR"><head><title>Navegação</title></head><body>' +
    '<nav epub:type="toc" id="toc"><h1>Sumário</h1><ol>' +
    '<li><a href="chapter.xhtml#inicio">Capítulo</a></li></ol></nav></body></html>');
  zip.file('OPS/chapter.xhtml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR" xml:lang="pt-BR">' +
    '<head><title>Capítulo</title></head><body>' +
    '<h1 id="inicio">Capítulo de teste</h1><p>Este texto precisa ser preservado.</p>' +
    '</body></html>');
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}


 
function createInvalidEpub2(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('META-INF/container.xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OPS/content.opf" ' +
    'media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OPS/content.opf',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:01aa1223-3322-4b44-a555-666777888999</dc:identifier>' +
    '<dc:title>Fixture EPUB 2</dc:title><dc:language>pt-BR</dc:language>' +
    '</metadata><manifest>' +
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' +
    '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
    '</manifest><spine toc="ncx"><itemref idref="chapter"/></spine></package>');
  zip.file('OPS/toc.ncx',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">' +
    '<head><meta name="dtb:uid" content="urn:uuid:01aa1223-3322-4b44-a555-666777888999"/>' +
    '<meta name="dtb:depth" content="1"/>' +
    '<meta name="dtb:totalPageCount" content="0"/>' +
    '<meta name="dtb:maxPageNumber" content="0"/></head>' +
    '<docTitle><text>Fixture EPUB 2</text></docTitle><navMap>' +
    '<navPoint id="chapter1" playOrder="1"><navLabel><text>Capítulo 1</text></navLabel>' +
    '<content src="chapter.xhtml#start"/></navPoint></navMap></ncx>');
  zip.file('OPS/chapter.xhtml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR" xml:lang="pt-BR">' +
    '<head><title>Capítulo</title></head><body>' +
    '<h1 id="start">Capítulo 1</h1><p>Texto de referência EPUB 2.</p>' +
    '</body></html>');
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}


type MimetypeVariant = 'mimetype-compressed' | 'mimetype-wrong-content' | 'mimetype-out-of-order';

 
async function makeMimetypeVariant(mode: MimetypeVariant): Promise<Uint8Array> {
  const original = await JSZip.loadAsync(await createInvalidEpub());
  const out = new JSZip();
  const originalContainer = original.file('META-INF/container.xml');
  if (!originalContainer) throw new Error('Fixture sem container OCF');
  if (mode === 'mimetype-out-of-order') {
    out.file('META-INF/container.xml', await originalContainer.async('uint8array'));
  }
  out.file('mimetype', mode === 'mimetype-wrong-content'
    ? 'application/epub+zip\n' : 'application/epub+zip', {
    compression: mode === 'mimetype-compressed' ? 'DEFLATE' : 'STORE',
  });
  for (const [name, file] of Object.entries(original.files)) {
    if (file.dir || (mode === 'mimetype-out-of-order' && name === 'META-INF/container.xml')) {
      continue;
    }
    out.file(name, await file.async('uint8array'));
  }
  return out.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}





type SpecProfile = 'epub3-core' | 'epub32-navigation' |
  'epub33-mathml' | 'epub34-fixed-layout';

async function createProfileSpecimen(profile: SpecProfile): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(await createInvalidEpub());
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  const oldOpf = await zip.file('OPS/book.opf')!.async('string');
  const oldChapter = await zip.file('OPS/chapter.xhtml')!.async('string');
  const oldNav = await zip.file('OPS/nav.xhtml')!.async('string');
  let opf = oldOpf;
  let chapter = oldChapter;
  let nav = oldNav;

  if (profile === 'epub32-navigation') {
    nav = nav.replace('</nav></body>',
      '</nav><nav epub:type="page-list"><h2>Páginas</h2><ol>' +
      '<li><a href="chapter.xhtml#inicio">1</a></li></ol></nav></body>');
  }
  if (profile === 'epub33-mathml') {
    opf = opf.replace('id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"',
      'id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml" ' +
      'properties="mathml"');
    chapter = chapter.replace('</body>',
      '<p><math xmlns="http://www.w3.org/1998/Math/MathML">' +
      '<mi>x</mi><mo>=</mo><mn>1</mn></math></p></body>');
  }
  if (profile === 'epub34-fixed-layout') {
    opf = opf.replace('</metadata>',
      '<meta property="rendition:layout">pre-paginated</meta></metadata>');
    chapter = chapter.replace('<head>', '<head>' +
      '<meta name="viewport" content="width=800, height=600"/>');
  }
  zip.file('OPS/book.opf', opf);
  zip.file('OPS/chapter.xhtml', chapter);
  zip.file('OPS/nav.xhtml', nav);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}


 
async function createMissingNavFromNcxSpecimen(): Promise<Uint8Array> {
  const z = new JSZip();
  z.file('META-INF/container.xml',
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/>' +
    '</rootfiles></container>');
  z.file('OPS/book.opf',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:ncx-hierarchy-specimen</dc:identifier>' +
    '<dc:title>Navegação hierárquica</dc:title><dc:language>pt-BR</dc:language>' +
    '<meta property="dcterms:modified">2026-11-05T12:00:00Z</meta>' +
    '</metadata><manifest>' +
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' +
    '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
    '</manifest><spine toc="ncx"><itemref idref="chapter"/></spine></package>');
  z.file('OPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR" xml:lang="pt-BR">' +
    '<head><title>Capítulo</title></head><body>' +
    '<h1 id="part">Parte Alfa</h1><h2 id="chapter">Capítulo um</h2>' +
    '<h3 id="section">Seção principal</h3><p>Conteúdo preservado.</p>' +
    '</body></html>');
  z.file('OPS/toc.ncx',
    '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">' +
    '<head><meta name="dtb:uid" content="urn:uuid:ncx-hierarchy-specimen"/>' +
    '<meta name="dtb:depth" content="3"/><meta name="dtb:totalPageCount" content="0"/>' +
    '<meta name="dtb:maxPageNumber" content="0"/></head>' +
    '<docTitle><text>Navegação hierárquica</text></docTitle><navMap>' +
    '<navPoint id="part" playOrder="1"><navLabel><text>Parte Alfa</text></navLabel>' +
    '<content src="chapter.xhtml#part"/>' +
    '<navPoint id="ch" playOrder="2"><navLabel><text>Capítulo um</text></navLabel>' +
    '<content src="chapter.xhtml#chapter"/>' +
    '<navPoint id="section" playOrder="3">' +
    '<navLabel><text>Seção principal</text></navLabel>' +
    '<content src="chapter.xhtml#section"/></navPoint></navPoint></navPoint>' +
    '</navMap></ncx>');
  return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}






function createVisualReaderSpecimen(fixed: boolean): Promise<Uint8Array> {
  const zip=new JSZip();
  zip.file('META-INF/container.xml',
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" ' +
    'media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OPS/book.opf',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:reader-visual-' +
    (fixed?'fixed':'reflow') + '</dc:identifier><dc:title>Reader Visual</dc:title>' +
    '<dc:language>pt-BR</dc:language>' +
    '<meta property="dcterms:modified">2026-11-06T12:00:00Z</meta>' +
    (fixed?'<meta property="rendition:layout">pre-paginated</meta>':'') +
    '</metadata><manifest>' +
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
    '<item id="ch" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="fig" href="image.svg" media-type="image/svg+xml"/>' +
    '</manifest><spine><itemref idref="ch"/></spine></package>');
  zip.file('OPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
    '<head><title>Sumário</title></head><body><nav epub:type="toc"><ol>' +
    '<li><a href="chapter.xhtml">Visual</a></li></ol></nav></body></html>');
  zip.file('OPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Conteúdo visual</title>' +
    (fixed?'<meta name="viewport" content="width=800, height=600"/>':'') +
    '<style type="text/css">body{margin:16px;font-family:serif;color:#172333}' +
    'h1{font-size:28px;font-weight:bold}.art{display:block;width:500px;height:230px}' +
    (fixed?'.art{position:absolute;left:120px;top:160px}':'') +
    '</style></head><body>' +
    '<h1>' + (fixed?'Prancha fixa':'Capítulo reflowable') + '</h1>' +
    '<p>Texto autoral precisa manter tipografia, imagem e ordem.</p>' +
    '<img class="art" src="image.svg" alt="Ilustração editorial colorida"/>' +
    '</body></html>');
  zip.file('OPS/image.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="230" ' +
    'viewBox="0 0 500 230"><rect width="500" height="230" fill="' +
    (fixed?'#ad39ba':'#10b4c9') + '"/>' +
    '<circle cx="250" cy="115" r="56" fill="#ffdd39"/></svg>');
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}

describe('Fixture sintética de conformidade oficial', () => {
  it('valida o EPUB ajustável produzido pelo conversor PDF', async () => {
    const options: ConverterOptions = {
      profile: 'book',
      outputLayout: 'reflowable',
      language: 'pt-BR',
      enableOcr: true,
      removeRepeatedMargins: true,
      removePageNumbers: true,
      dehyphenate: true,
      normalizeTypography: true,
    };
    const pixel = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABCf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=';
    const analysis: PdfAnalysisResult = {
      fileName: 'fixture-conversor.pdf',
      fileSize: 2048,
      pageCount: 2,
      title: 'Fixture do conversor',
      author: 'EPUB Repair',
      metadata: {
        publisher: '',
        publicationDate: '',
        isbn: '',
        translator: '',
        description: '',
      },
      pages: [
        {
          pageNumber: 1,
          width: 600,
          height: 800,
          lines: [],
          text: 'Capítulo 1\nTexto reconstruído pelo conversor.',
          nativeCharacters: 43,
          usedOcr: false,
          columnCount: 1,
          imageCount: 0,
          kind: 'text',
          preserveAsImage: false,
        },
        {
          pageNumber: 2,
          width: 600,
          height: 800,
          lines: [],
          text: '',
          nativeCharacters: 0,
          usedOcr: false,
          columnCount: 1,
          imageCount: 1,
          kind: 'visual',
          preserveAsImage: true,
          previewDataUrl: pixel,
        },
      ],
      sections: [{
        id: 'section-001',
        title: 'Capítulo 1',
        html: '<h1>Capítulo 1</h1><p>Texto reconstruído pelo conversor.</p>',
        plainText: 'Capítulo 1\n\nTexto reconstruído pelo conversor.',
        sourcePages: [1],
      }],
      warnings: [],
      suggestedLayout: 'reflowable',
      nativeTextPages: 1,
      ocrPages: 0,
      scannedPages: 0,
      visualPages: 1,
      blankPages: 0,
      repeatedMarginLines: [],
      qualityScore: 96,
    };
    const result = await buildEpubFromPdf({
      sourceBytes: new Uint8Array([37, 80, 68, 70]),
      analysis,
      sections: analysis.sections,
      title: analysis.title,
      author: analysis.author,
      options,
    });
    expect(result.validation.stats.fatalCount).toBe(0);
    expect(result.validation.stats.errorCount).toBe(0);
    const zip = await JSZip.loadAsync(result.bytes);
    expect(zip.file('OEBPS/Images/visual-page-0002.jpg')).not.toBeNull();
    expect(await zip.file('OEBPS/nav.xhtml')!.async('string')).toContain('Página visual 2');
    const outputDir = process.env.EPUBCHECK_FIXTURE_OUTPUT;
    if (outputDir) {
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(outputDir, 'converter-reflowable.epub'), Buffer.from(result.bytes));
    }
  });

  for(const profile of ['reflowable','fixed-layout'] as const) {
    it('E-076: exporta EPUB reparado para Calibre ebook-viewer ' + profile,
      async()=>{
        const source=await createVisualReaderSpecimen(profile==='fixed-layout');
        const result=await repairEpub('visual-'+profile+'.epub',source,{
          ...DEFAULT_REPAIR_OPTIONS,conservativeMode:true,
        });
        expect(result.changed).toBe(true);
        expect(result.after.stats.fatalCount).toBe(0);
        expect(result.blob).toBeDefined();
        const original=await JSZip.loadAsync(source);
        const repaired=await JSZip.loadAsync(await result.blob!.arrayBuffer());
        for(const path of ['OPS/chapter.xhtml','OPS/image.svg']){
          expect(await repaired.file(path)!.async('string'))
            .toBe(await original.file(path)!.async('string'));
        }
        const out=process.env.EPUBCHECK_FIXTURE_OUTPUT;
        if(out){
          await mkdir(out,{recursive:true});
          await writeFile(join(out,'visual-'+profile+'.epub'),
            Buffer.from(await result.blob!.arrayBuffer()));
        }
      },30000);
  }


  it('E-068: gera NAV hierárquico a partir de NCX autoral para EPUBCheck', async () => {
    const original = await createMissingNavFromNcxSpecimen();
    const output = await repairEpub('ncx-hierarchy.epub', original, {
      ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true,
    });
    expect(output.changed).toBe(true);
    expect(output.blob).toBeDefined();
    expect(output.after.stats.fatalCount).toBe(0);
    const bytes = new Uint8Array(await output.blob!.arrayBuffer());
    const zip = await JSZip.loadAsync(bytes);
    const nav = await zip.file('OPS/nav.xhtml')?.async('string');
    expect(nav).toBeTruthy();
    expect(nav?.match(/<ol>/gu)).toHaveLength(3);
    expect(nav).toContain('href="chapter.xhtml#chapter"');
    expect(nav).toContain('Seção principal');
    const outputDir = process.env.EPUBCHECK_FIXTURE_OUTPUT;
    if (outputDir) {
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(outputDir, 'original-invalid-ncx-hierarchy.epub'),
        Buffer.from(original));
      await writeFile(join(outputDir, 'repaired-valid-ncx-hierarchy.epub'),
        Buffer.from(bytes));
    }
  });


  for (const profile of [
    'epub3-core', 'epub32-navigation', 'epub33-mathml', 'epub34-fixed-layout',
  ] as const) {
    it('E-036: matriz oficial de perfil ' + profile + ' com version="3.0"', async () => {
      const source = await createProfileSpecimen(profile);
      const before = await inspectEpub(profile + '.epub', source);
      expect(before.validZip).toBe(true);
      expect(before.packageInfo?.version).toBe('3.0');
      expect(before.stats.fatalCount).toBe(0);
      const result = await repairEpub(profile + '.epub', source, {
        ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true,
      });
      const final = result.blob
        ? new Uint8Array(await result.blob.arrayBuffer()) : source;
      expect(result.after.stats.fatalCount).toBe(0);
      expect(result.after.packageInfo?.version).toBe('3.0');
      const finalZip = await JSZip.loadAsync(final);
      const sourceZip = await JSZip.loadAsync(source);
      expect(await finalZip.file('OPS/chapter.xhtml')!.async('string'))
        .toBe(await sourceZip.file('OPS/chapter.xhtml')!.async('string'));
      const outputDir = process.env.EPUBCHECK_FIXTURE_OUTPUT;
      if (outputDir) {
        await mkdir(outputDir, { recursive: true });
        await writeFile(join(outputDir, 'profile-' + profile + '.epub'), Buffer.from(final));
      }
    });
  }



  for (const variant of [
    'mimetype-compressed', 'mimetype-wrong-content', 'mimetype-out-of-order',
  ] as const) {
    it('E-030/E-091: EPUBCheck diferencial de ' + variant, async () => {
      const original = await makeMimetypeVariant(variant);
      const before = await inspectEpub('original-' + variant + '.epub', original);
      const expected = variant === 'mimetype-compressed' ? 'MIME_COMPRESSED'
        : variant === 'mimetype-out-of-order' ? 'MIME_NOT_FIRST' : 'MIME_INVALID_CONTENT';
      expect(before.issues.some((issue) => issue.code === expected)).toBe(true);
      const repaired = await repairEpub('original-' + variant + '.epub', original, {
        ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true,
      });
      expect(repaired.changed).toBe(true);
      expect(repaired.blob).toBeDefined();
      expect(repaired.after.stats.fatalCount).toBe(0);
      expect(repaired.after.issues.some((issue) => issue.code === expected)).toBe(false);
      const bytes = new Uint8Array(await repaired.blob!.arrayBuffer());
      const outputDir = process.env.EPUBCHECK_FIXTURE_OUTPUT;
      if (outputDir) {
        await mkdir(outputDir, { recursive: true });
        await writeFile(join(outputDir, 'original-invalid-' + variant + '.epub'),
          Buffer.from(original));
        await writeFile(join(outputDir, 'repaired-valid-' + variant + '.epub'),
          Buffer.from(bytes));
      }
    });
  }

  it('E-091: EPUBCheck verifica também um reparo de EPUB 2 com NCX válido', async () => {
    const source = await createInvalidEpub2();
    const before = await inspectEpub('original-epub2.epub', source);
    expect(before.issues.some((issue) => issue.code === 'MIME_MISSING')).toBe(true);
    const result = await repairEpub('original-epub2.epub', source, {
      ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true,
    });
    expect(result.changed).toBe(true);
    expect(result.blob).toBeDefined();
    expect(result.after.stats.fatalCount).toBe(0);
    const bytes = new Uint8Array(await result.blob!.arrayBuffer());
    const outputDir = process.env.EPUBCHECK_FIXTURE_OUTPUT;
    if (outputDir) {
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(outputDir, 'original-invalid-epub2.epub'), Buffer.from(source));
      await writeFile(join(outputDir, 'repaired-valid-epub2.epub'), Buffer.from(bytes));
    }
  });

  it('E-035/E-091: gera original inválido e EPUB corrigido para EPUBCheck externo', async () => {
    const original = await createInvalidEpub();
    const before = await inspectEpub('fixture.epub', original);
    expect(before.issues.some((issue) => issue.code === 'MIME_MISSING')).toBe(true);

    const result = await repairEpub('fixture.epub', original, {
      ...DEFAULT_REPAIR_OPTIONS,
      conservativeMode: true,
    });
    expect(result.changed).toBe(true);
    expect(result.blob).toBeDefined();
    expect(result.after.validZip).toBe(true);
    expect(result.after.stats.fatalCount).toBe(0);
    expect(result.after.issues.some((issue) => issue.code === 'MIME_MISSING')).toBe(false);

    
    const repairedBytes = new Uint8Array(await result.blob!.arrayBuffer());
    const second = await repairEpub('fixture-k.epub', repairedBytes, {
      ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true,
    });
    expect(second.changed).toBe(false);
    expect(second.blob).toBeUndefined();

    const outputDir = process.env.EPUBCHECK_FIXTURE_OUTPUT;
    if (outputDir && result.blob) {
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(outputDir, 'original-invalid.epub'), Buffer.from(original));
      await writeFile(join(outputDir, 'repaired-valid.epub'), Buffer.from(repairedBytes));
    }
  });
});
