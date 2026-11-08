// @vitest-environment jsdom
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { createInitialState } from '../src/app/state';
import { renderControls } from '../src/ui/components/Controls';
import { buildRepairConsentMessage } from '../src/app/repairConsent';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { repairEpub } from '../src/epub/repair/repairEpub';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';

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
const txt = (v: string) => new TextEncoder().encode(v);
function concat(...items: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(items.reduce((n, i) => n + i.length, 0));
  let cursor = 0;
  for (const item of items) { result.set(item, cursor); cursor += item.length; }
  return result;
}
function app(marker: number, value: Uint8Array): Uint8Array {
  const size = value.length + 2;
  return concat(Uint8Array.of(0xff,marker,size>>8,size&255),value);
}
function photo(orientation: number): Uint8Array {
  const tiff = Uint8Array.of(73,73,42,0,8,0,0,0,1,0,
    0x12,1,3,0,1,0,0,0,orientation,0,0,0,0,0,0,0);
  return concat(Uint8Array.of(255,216),
    app(0xe1,concat(txt('Exif\0\0'),tiff)),
    app(0xe1,txt('http://ns.adobe.com/xap/1.0/\0<metadata/>')),
    app(0xe2,txt('ICC_PROFILE\0profile')),
    Uint8Array.of(255,218,0,8,1,1,0,0,63,0,100,40,255,217));
}
async function book(orientation: number): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype','application/epub+zip',{compression:'STORE'});
  zip.file('META-INF/container.xml',
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
    '<rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/>' +
    '</rootfiles></container>');
  zip.file('OPS/book.opf',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="id">urn:uuid:metadata-fixture</dc:identifier>' +
    '<dc:title>Fotografias</dc:title><dc:language>pt-BR</dc:language>' +
    '<meta property="dcterms:modified">2026-11-05T10:00:00Z</meta>' +
    '</metadata><manifest>' +
    '<item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>' +
    '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="img" href="img.jpg" media-type="image/jpeg"/>' +
    '</manifest><spine><itemref idref="chapter"/></spine></package>');
  zip.file('OPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
    '<head><title>Sumário</title></head><body><nav epub:type="toc"><ol>' +
    '<li><a href="chapter.xhtml">Início</a></li></ol></nav></body></html>');
  zip.file('OPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Capítulo</title></head>' +
    '<body><h1>Fotografias</h1><img src="img.jpg" alt="Fotografia"/></body></html>');
  zip.file('OPS/img.jpg', photo(orientation));
  return zip.generateAsync({ type:'uint8array', compression:'DEFLATE' });
}

describe('E-075: remover metadados EPUB exige opt-in; integridade e UX', () => {
  it('original permanece intacto com default; seleção gera cópia sem EXIF/XMP', async () => {
    const bytes = await book(1);
    const pristine = new Uint8Array(bytes);
    const before = await inspectEpub('foto.epub', bytes);
    expect(before.validZip).toBe(true);
    expect(before.issues.some((x) => x.code === 'IMAGE_EMBEDDED_METADATA')).toBe(true);
    const defaultResult = await repairEpub('foto.epub', bytes, {
      ...DEFAULT_REPAIR_OPTIONS, conservativeMode: true,
    }, 'optimization');
    expect(defaultResult.changed).toBe(false);
    expect(defaultResult.blob).toBeUndefined();

    const selected = { ...DEFAULT_REPAIR_OPTIONS,
      stripImageMetadata: true, conservativeMode: true };
    const consent = buildRepairConsentMessage(selected, before);
    expect(consent).toContain('EXIF');
    expect(consent).toContain('OPS/img.jpg');
    const state = createInitialState();
    state.options = selected;
    state.report = before;
    state.payload = { file: new File([new Uint8Array(bytes)], 'foto.epub'), bytes };
    const ui = renderControls(state, { analyze: () => {}, repair: () => {},
      copy: () => {}, downloadTextReport: () => {}, downloadJsonReport: () => {} });
    const action = [...ui.querySelectorAll('button')].find((x) =>
      /^(?:Aplicar otimização opcional|Gerar EPUB corrigido)$/u.test(x.textContent ?? ''));
    expect(action?.disabled).toBe(false);

    const output = await repairEpub('foto.epub', bytes, selected, 'optimization');
    expect(output.changed).toBe(true);
    expect(output.operation).toBe('optimization');
    expect(output.blob).toBeDefined();
    expect(output.after.validZip).toBe(true);
    expect(output.after.stats.fatalCount).toBe(0);
    expect(output.after.issues.some((x) => x.code === 'IMAGE_EMBEDDED_METADATA')).toBe(false);
    const originalZip = await JSZip.loadAsync(bytes);
    const outputZip = await JSZip.loadAsync(await output.blob!.arrayBuffer());
    const original = await originalZip.file('OPS/img.jpg')!.async('uint8array');
    const altered = await outputZip.file('OPS/img.jpg')!.async('uint8array');
    expect(new TextDecoder().decode(original)).toContain('Exif');
    expect(new TextDecoder().decode(altered)).not.toContain('Exif');
    expect(new TextDecoder().decode(altered)).toContain('ICC_PROFILE');
    // JSZip gera timestamps novos: comparar a MESMA entrada antes/depois,
    // nunca um segundo ZIP reconstituído em outro instante.
    expect([...bytes]).toEqual([...pristine]);
  }, 30_000);

  it('não retira orientação EXIF 6 nem anuncia limpeza total', async () => {
    const bytes = await book(6);
    const result = await repairEpub('foto.epub', bytes, {
      ...DEFAULT_REPAIR_OPTIONS, stripImageMetadata: true, conservativeMode: true,
    }, 'optimization');
    expect(result.actions.some((x) => x.type === 'skipped')).toBe(true);
    expect(result.actions.some((x) => x.type === 'normalized')).toBe(true);
    expect(result.after.issues.some((x) => x.code === 'IMAGE_EMBEDDED_METADATA')).toBe(true);
    const zip = await JSZip.loadAsync(await result.blob!.arrayBuffer());
    const image = await zip.file('OPS/img.jpg')!.async('uint8array');
    expect(new TextDecoder().decode(image)).toContain('Exif');
  }, 30_000);
});
