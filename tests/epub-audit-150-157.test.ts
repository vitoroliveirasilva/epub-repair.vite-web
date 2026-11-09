// @vitest-environment jsdom
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateManifestFallbacks } from '../src/epub/validation/validateManifestFallbacks';
import { validateCssReferences } from '../src/epub/validation/validateCssReferences';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { validateImageResources } from '../src/epub/validation/validateImageResources';
import { parseSmilClock } from '../src/epub/utils/smilClock';
import { validateMediaOverlays } from '../src/epub/validation/validateMediaOverlays';
import { renderRejectedUploadReport } from '../src/app/createApp';
import { buildValidationReport } from '../src/epub/utils/reportBuilder';
import { EPUB_MIME } from '../src/epub/utils/constants';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { ManifestItem, PackageDocumentInfo } from '../src/epub/model/opfTypes';

const enc = new TextEncoder();
const manifestItem = (id: string, mediaType: string, fallback?: string): ManifestItem => ({
  id, mediaType, href: id, resolvedPath: 'OPS/' + id, exists: true, pathSafe: true,
  properties: [], ...(fallback ? { fallback } : {}),
});
const pkg = (items: ManifestItem[]): PackageDocumentInfo => ({
  version: '3.3', opfPath: 'OPS/content.opf', opfDir: 'OPS', rootfileCount: 1,
  manifest: items, spine: [], metadata: {},
});
const loaded = (entries: Array<[string, Uint8Array | string]>): LoadedEpub => ({
  files: new Map(entries.map(([path, input]) => [path, {
    path, directory: false, bytes: typeof input === 'string' ? enc.encode(input) : input,
  }])),
}) as unknown as LoadedEpub;

describe('Sétima auditoria E-150 a E-157', () => {
  it('E-150: formato básico em posição intermediária já satisfaz fallback', () => {
    const items = [
      manifestItem('document','application/pdf','image'),
      manifestItem('image','image/png','extra'),
      manifestItem('extra','application/octet-stream'),
    ];
    const problems = validateManifestFallbacks(pkg(items));
    expect(problems.some((issue) => issue.code === 'OPF_FALLBACK_INVALID_TERMINAL')).toBe(false);
  });

  it('E-155: somente audio/ogg declarado como OPUS conta como core EPUB 3.3', () => {
    const validate = (media: string) => validateManifestFallbacks(pkg([
      manifestItem('source','application/pdf','audio'),
      manifestItem('audio',media),
    ])).map((issue) => issue.code);
    expect(validate('audio/ogg')).toContain('OPF_FALLBACK_INVALID_TERMINAL');
    expect(validate('audio/ogg; codecs=vorbis')).toContain('OPF_FALLBACK_INVALID_TERMINAL');
    expect(validate('audio/ogg; codecs=opus')).not.toContain('OPF_FALLBACK_INVALID_TERMINAL');
    expect(validate('audio/ogg; codecs="opus"')).not.toContain('OPF_FALLBACK_INVALID_TERMINAL');
  });

  it('E-151: CSS local com escape válido aponta ao arquivo existente', () => {
    const cssPath = 'OPS/Styles/main.css';
    const imagePath = 'OPS/Images/cover.png';
    const source = '.cover{background-image:url("../Images/co\\76 er.png")}';
    const issues = validateCssReferences(loaded([
      [cssPath, source], [imagePath, Uint8Array.of(0x89, 0x50, 0x4e, 0x47)],
    ]), pkg([{
      ...manifestItem('css','text/css'), href: 'Styles/main.css', resolvedPath: cssPath,
    }]));
    expect(issues.some((issue) => issue.code === 'CSS_MISSING_RESOURCE')).toBe(false);
  });

  it('E-152: ZIP com arquivo inseguro reporta erro mas mantém entradas seguras', async () => {
    const zip = new JSZip();
    zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
    zip.file('OPS/chapter.xhtml', '<html><body>Conteúdo original</body></html>',
      { createFolders: false });
    zip.file('../untrusted.bin', 'Não publicar', { createFolders: false });
    const result = await loadEpub('entrada.epub',
      new Uint8Array(await zip.generateAsync({ type:'uint8array' })));
    expect(result.validZip).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'ZIP_UNSAFE_PATH')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'ZIP_JSZIP_ENTRY_MISMATCH')).toBe(false);
    expect(result.files.has('OPS/chapter.xhtml')).toBe(true);
    expect(result.files.has('untrusted.bin')).toBe(false);
  });

  it('E-153: JPEG com assinatura SOI mas sem quadro SOF é reportado', () => {
    const imagePath = 'OPS/cover.jpg';
    const issues = validateImageResources(loaded([
      [imagePath, Uint8Array.of(0xff,0xd8,0xff,0xd9)],
    ]), pkg([manifestItem('cover.jpg','image/jpeg')]));
    expect(issues.some((issue) => issue.code === 'IMAGE_MISSING_FRAME')).toBe(true);
  });

  it('E-154: relógio SMIL recusa segundos 60 ou maiores e minutos full acima de 59', () => {
    expect(parseSmilClock('01:75')).toBeNaN();
    expect(parseSmilClock('01:60:00')).toBeNaN();
    expect(parseSmilClock('01:59.999')).toBeCloseTo(119.999);
    expect(parseSmilClock('1:02:03.5')).toBeCloseTo(3723.5);
    expect(parseSmilClock('61:00')).toBe(3660);
    expect(parseSmilClock('400ms')).toBe(0.4);
    expect(parseSmilClock('npt=2.5s')).toBe(2.5);
  });

  const smil = '<smil xmlns="http://www.w3.org/ns/SMIL" version="3.0"><body>' +
    '<par><text src="chapter.xhtml#p1"/>' +
    '<audio src="audio.mp3" clipBegin="0s" clipEnd="01:75"/></par></body></smil>';
  const manifest = [
    { ...manifestItem('chapter','application/xhtml+xml'), resolvedPath:'OPS/chapter.xhtml',
      mediaOverlay:'sync' },
    { ...manifestItem('sync','application/smil+xml'),resolvedPath:'OPS/sync.smil' },
    { ...manifestItem('audio','audio/mpeg'),resolvedPath:'OPS/audio.mp3' },
  ];
  const opf = (metadata: string) =>
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0">' +
    '<metadata>' + metadata + '</metadata></package>';
  const overlay = (metadata: string) => validateMediaOverlays(loaded([
    ['OPS/content.opf',opf(metadata)],
    ['OPS/sync.smil',smil],
    ['OPS/chapter.xhtml',
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><p id="p1">Olá</p></body></html>'],
    ['OPS/audio.mp3', Uint8Array.of(1,2,3)],
  ]),pkg(manifest)).map((issue) => issue.code);

  it('E-154: clipe SMIL inválido também é detectado pelo validador de EPUB',()=>{
    expect(overlay('<meta property="media:duration">10s</meta>' +
      '<meta property="media:duration" refines="#sync">10s</meta>'))
      .toContain('MEDIA_OVERLAY_INVALID_TIMING');
  });

  it('E-156: informa ausência, valor inválido, duplicação e divergência de duração',()=>{
    expect(overlay('')).toContain('MEDIA_OVERLAY_DURATION_MISSING');
    expect(overlay('<meta property="media:duration">01:75</meta>' +
      '<meta property="media:duration" refines="#sync">10s</meta>'))
      .toContain('MEDIA_OVERLAY_DURATION_INVALID');
    expect(overlay('<meta property="media:duration">10s</meta>' +
      '<meta property="media:duration">11s</meta>' +
      '<meta property="media:duration" refines="#sync">10s</meta>'))
      .toContain('MEDIA_OVERLAY_DURATION_DUPLICATE');
    expect(overlay('<meta property="media:duration">10s</meta>' +
      '<meta property="media:duration" refines="#sync">2s</meta>'))
      .toContain('MEDIA_OVERLAY_DURATION_MISMATCH');
    expect(overlay('<meta property="media:duration">10s</meta>' +
      '<meta property="media:duration" refines="#sync">10s</meta>'))
      .not.toContain('MEDIA_OVERLAY_DURATION_MISMATCH');
  });

  it('E-157: diagnóstico do EPUB recusado possui botões TXT e JSON exclusivos',()=>{
    const report = buildValidationReport({
      fileName:'novo-invalido.epub',fileSize:12,validZip:false,zipEntries:[],issues:[],
    });
    const panel = renderRejectedUploadReport(report,'simple',()=>{});
    expect(panel.textContent).toContain('novo-invalido.epub');
    expect(panel.textContent).toContain('Baixar TXT do EPUB recusado');
    expect(panel.textContent).toContain('Baixar JSON do EPUB recusado');
  });

  it('CI econômico: commits em dev não acionam emuladores e preservam checks Node 20/22 em prod',()=>{
    const read=(name:string)=>readFileSync('.github/workflows/'+name+'.yml','utf8');
    for(const workflow of ['android-emulator','ios-simulator','kindle-preview',
      'browser-matrix','calibre-reader','coverage']){
      const source=read(workflow);
      const triggerSection=source.slice(source.indexOf('on:'),source.indexOf('permissions:'));
      expect(triggerSection).not.toContain('branches: [dev]');
      expect(triggerSection).toContain('workflow_dispatch:');
      if(['browser-matrix','calibre-reader','coverage'].includes(workflow)) {
        // Suíte cara só em PR de release pronta; nunca em push da dev.
        expect(triggerSection).toContain('pull_request:');
        expect(triggerSection).toContain('types: [opened, reopened, synchronize, ready_for_review]');
        expect(triggerSection).toContain('branches: [prod]');
        expect(source).toContain("if: github.event_name != 'pull_request' || !github.event.pull_request.draft");
      } else {
        expect(triggerSection).not.toContain('pull_request:');
        expect(triggerSection).not.toContain('push:');
      }
    }
    const ci=read('ci');
    expect(ci).toContain('["22.x"]');
    expect(ci).toContain('["20.x","22.x"]');
    expect(ci).toContain('types: [opened, reopened, synchronize, ready_for_review]');
    expect(ci).toContain("github.event_name != 'pull_request' || !github.event.pull_request.draft");
    expect(ci).toContain("github.event_name == 'workflow_dispatch' || github.ref == 'refs/heads/prod'");
    expect(ci).toContain("github.base_ref == 'prod' && !github.event.pull_request.draft");
    const preview=read('netlify-live-preview');
    expect(preview).toContain('types: [opened, reopened, ready_for_review]');
    const supply=read('supply-chain');
    expect(supply).toContain("    paths:\n      - 'package.json'");
  });
});
