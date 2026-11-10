
import { beforeAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { sanitizeCssDocument } from '../src/epub/sanitize/sanitizeCss';
import { containsDangerousCss } from '../src/epub/sanitize/sanitizeActiveContent';
import { sanitizeHtmlDocument } from '../src/epub/sanitize/sanitizeHtml';
import { extractCssResourceReferences } from '../src/epub/validation/referenceExtractor';
import { validateCssReferences } from '../src/epub/validation/validateCssReferences';
import { validateContentReferences } from '../src/epub/validation/validateContentReferences';
import { buildValidationReport } from '../src/epub/utils/reportBuilder';
import { createIssue } from '../src/epub/utils/issueFactory';
import { repairEpub } from '../src/epub/repair/repairEpub';
import { replaceEpubCover } from '../src/epub/cover/replaceCover';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

beforeAll(() => {
  if (typeof Blob.prototype.arrayBuffer === 'function') return;
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error('blob inválido'));
      reader.readAsArrayBuffer(this);
    });
  };
});
const encode = (value: string) => new TextEncoder().encode(value);
const loaded = (files: Array<[string, Uint8Array]>) =>
  ({ files: new Map(files.map(([path, bytes]) => [path, { path, bytes, directory:false }])) } as unknown as LoadedEpub);
const manifestItem = (path: string, mime: string) =>
  ({ id: 'resource', href: path.split('/').at(-1), resolvedPath: path,
    exists:true, pathSafe:true, properties:[], mediaType:mime });

describe('E-102 / E-105: imagens incorporadas e comentários CSS', () => {
  it('preserva PNG raster data: no fundo, mas neutraliza SVG ativo', () => {
    const safe = 'p{background:url("data:image/png;base64,AAECAw==")}';
    const valid = sanitizeCssDocument('OPS/a.css', safe, new Set(['OPS/a.css']));
    expect(valid.changed).toBe(false);
    expect(containsDangerousCss(safe)).toBe(false);
    const path = 'OPS/a.css';
    const report = validateCssReferences(loaded([[path, encode(safe)]]), {
      manifest: [manifestItem(path, 'text/css')],
    } as unknown as PackageDocumentInfo);
    expect(report.map((issue) => issue.code)).not.toContain('CSS_UNSAFE_RESOURCE');
    const hostile = 'p{background:url("data:image/svg+xml;base64,PHN2Zz4=")}';
    expect(containsDangerousCss(hostile)).toBe(true);
    expect(sanitizeCssDocument(path, hostile, new Set([path])).text)
      .not.toContain('data:image/svg+xml');
  });
  it('não inventa referências em comentários CSS', () => {
    const css = '/* url("../fake.png"); @import "not-a-file.css"; */' +
      ' p{background:url("../real.png")}';
    const refs = extractCssResourceReferences(css).map((ref) => ref.value);
    expect(refs).toEqual(['../real.png']);
    const path = 'OPS/css/main.css';
    const report = validateCssReferences(loaded([[path, encode(css)]]), {
      manifest: [manifestItem(path, 'text/css')],
    } as unknown as PackageDocumentInfo);
    expect(report.filter((issue) => issue.code === 'CSS_MISSING_RESOURCE')).toHaveLength(1);
    expect(report[0]?.detail).toContain('real.png');
  });
});

describe('E-109 / E-112: preservar HTML e distinguir remissões editoriais', () => {
  it('não reescreve tags de script que aparecem apenas em comentário', () => {
    const input = '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
      '<!-- Exemplo: <script>literal()</script> -->' +
      '<p>Prosa original</p><script>real()</script></body></html>';
    const result = sanitizeHtmlDocument(input, {
      filePath:'OPS/chapter.xhtml', existingFiles:new Set(['OPS/chapter.xhtml']),
      sanitizeScripts:true, kindleSafeMode:false, removeRemoteResourceLinks:false,
    });
    expect(result.text).toContain('<!-- Exemplo: <script>literal()</script> -->');
    expect(result.text).not.toContain('<script>real()</script>');
    expect(result.text).toContain('Prosa original');
  });
  it('link href ausente é manual, mas uma imagem src ausente segue reparável', () => {
    const path = 'OPS/chapter.xhtml';
    const text = '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
      '<a href="missing.xhtml">Capítulo perdido</a>' +
      '<img src="missing.png" alt="Capa"/></body></html>';
    const issues = validateContentReferences(loaded([[path, encode(text)]]), {
      manifest:[manifestItem(path, 'application/xhtml+xml')],
    } as unknown as PackageDocumentInfo).filter((issue) => issue.code === 'CONTENT_MISSING_RESOURCE');
    expect(issues.find((issue) => issue.context === 'href')?.repairable).toBe(false);
    expect(issues.find((issue) => issue.context === 'img:src')?.repairable).toBe(true);
  });
});

describe('E-110 / E-111: autenticidade de pacote e score consciente', () => {
  it('assinaturas existentes bloqueiam tanto reparos como troca de capa', async () => {
    const zip = await JSZip.loadAsync(await buildKindleIssueEpub());
    zip.file('META-INF/signatures.xml', '<signatures xmlns="urn:test"/>');
    const bytes = new Uint8Array(await zip.generateAsync({type:'uint8array'}));
    await expect(repairEpub('assinado.epub', bytes)).rejects.toThrow(/assinad|assinatura/iu);
    await expect(replaceEpubCover('assinado.epub', bytes, {
      fileName:'novo.jpg', bytes:Uint8Array.of(0xff,0xd8,0xff,0xd9),
      mediaType:'image/jpeg', previewDataUrl:'',
    })).rejects.toThrow(/assinad|assinatura/iu);
  });
  it('conteúdo ativo órfão reduz score; JS declarado informativo não reduz', () => {
    const report = (code: 'PACKAGE_UNDECLARED_ACTIVE_CONTENT' | 'PACKAGE_DECLARED_SCRIPT',
      severity: 'warning' | 'info') => buildValidationReport({
      fileName:'x.epub',fileSize:100,validZip:true,zipEntries:[],
      issues:[createIssue({code,severity,title:code,detail:'Inventário',repairable:false})],
    });
    expect(report('PACKAGE_UNDECLARED_ACTIVE_CONTENT','warning').stats.securityScore).toBeLessThan(100);
    expect(report('PACKAGE_DECLARED_SCRIPT','info').stats.securityScore).toBe(100);
  });
});

describe('E-103: consentimento de metadados junto ao reparo normal', () => {
  it('remove exatamente EXIF com orientação 1 sem disparar guarda de imagens', async () => {
    const zip = await JSZip.loadAsync(await buildKindleIssueEpub());
    const tiff = Uint8Array.of(73,73,42,0,8,0,0,0,1,0,
      0x12,1,3,0,1,0,0,0,1,0,0,0,0,0,0,0);
    const size = tiff.length+6+2;
    const photo = Uint8Array.of(0xff,0xd8,0xff,0xe1,size>>8,size&255,
      ...encode('Exif\0\0'),...tiff,0xff,0xda,0,8,1,1,0,0,63,0,100,40,0xff,0xd9);
    zip.file('OEBPS/Images/cover.jpg', photo);
    const input = new Uint8Array(await zip.generateAsync({type:'uint8array'}));
    const result = await repairEpub('metadados.epub', input, {
      ...DEFAULT_REPAIR_OPTIONS, conservativeMode:true, stripImageMetadata:true,
    });
    expect(result.changed).toBe(true);
    expect(result.actions.some((action) =>
      action.title === 'Metadados de imagem removidos com consentimento')).toBe(true);
    const output = await JSZip.loadAsync(await result.blob!.arrayBuffer());
    const jpeg = await output.file('OEBPS/Images/cover.jpg')!.async('uint8array');
    expect(new TextDecoder().decode(jpeg)).not.toContain('Exif');
  }, 30000);
});
