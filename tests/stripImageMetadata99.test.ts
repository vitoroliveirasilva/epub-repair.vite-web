import { describe, expect, it } from 'vitest';
import { stripImageMetadata } from '../src/epub/repair/stripImageMetadata';
import { validateImageMetadata } from '../src/epub/validation/validateImageMetadata';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const text = (s: string) => new TextEncoder().encode(s);
function join(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}
function tiff(orientation: number): Uint8Array {
  return Uint8Array.from([
    73, 73, 42, 0, 8, 0, 0, 0,
    1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0,
    orientation, 0, 0, 0,
    0, 0, 0, 0,
  ]);
}
function segment(id: number, payload: Uint8Array): Uint8Array {
  const len = payload.length + 2;
  return join(Uint8Array.of(255, id, len >> 8, len & 255), payload);
}
function jpeg(orientation: number): Uint8Array {
  return join(Uint8Array.of(255, 216),
    segment(0xe1, join(text('Exif\0\0'), tiff(orientation))),
    segment(0xe1, join(text('http://ns.adobe.com/xap/1.0/\0'), text('<xmp/>'))),
    segment(0xed, text('Photoshop 3.0\0metadata')),
    segment(0xe2, text('ICC_PROFILE\0colors')),
    Uint8Array.of(255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 127, 0, 255, 217),
  );
}
function pngChunk(name: string, bytes: Uint8Array): Uint8Array {
  const output = new Uint8Array(12 + bytes.length);
  const view = new DataView(output.buffer);
  view.setUint32(0, bytes.length, false);
  output.set(text(name), 4);
  output.set(bytes, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < bytes.length + 8; i++) {
    crc ^= output[i]!;
    for (let j = 0; j < 8; j++) crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320
      : crc >>> 1;
  }
  view.setUint32(bytes.length + 8, (crc ^ 0xffffffff) >>> 0, false);
  return output;
}
function png(): Uint8Array {
  const signature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
  const ihdr = Uint8Array.of(0,0,0,1,0,0,0,1,8,2,0,0,0);
  return join(signature, pngChunk('IHDR', ihdr),
    pngChunk('eXIf', tiff(1)), pngChunk('tEXt', text('Author\0Metadata')),
    pngChunk('IDAT', Uint8Array.of(0x78,0x9c,0x63,0,0,0,2,0,1)),
    pngChunk('iTXt', text('XML:com.adobe.xmp\0\0\0\0\0Hello')),
    pngChunk('IEND', new Uint8Array()));
}
function webp(): Uint8Array {
  const vp8x = new Uint8Array(18);
  vp8x.set(text('VP8X'));
  new DataView(vp8x.buffer).setUint32(4, 10, true);
  vp8x[8] = 0x2c; 
  const chunk = (name: string, data: Uint8Array): Uint8Array => {
    const part = new Uint8Array(8 + data.length + (data.length & 1));
    part.set(text(name));
    new DataView(part.buffer).setUint32(4, data.length, true);
    part.set(data, 8);
    return part;
  };
  const body = join(text('WEBP'), vp8x, chunk('ICCP', text('colors')),
    chunk('VP8 ', Uint8Array.of(0x11, 0x22)),
    chunk('EXIF', tiff(1)), chunk('XMP ', text('meta')));
  const output = join(text('RIFF'), new Uint8Array(4), body);
  new DataView(output.buffer).setUint32(4, output.length - 8, true);
  return output;
}
function metadata(mime: string, bytes: Uint8Array): string {
  const loaded = { files: new Map([['img', { bytes }]]) } as unknown as LoadedEpub;
  const pkg = { manifest: [{
    exists: true, mediaType: mime, resolvedPath: 'img',
  }] } as unknown as PackageDocumentInfo;
  return validateImageMetadata(loaded, pkg)[0]?.context ?? '';
}

describe('E-075: scrub opt-in conservador sem recompressão ou perda de perfil ICC', () => {
  it('remove EXIF/XMP/Photoshop JPEG com orientação 1, preserva ICC e scan', () => {
    const original = jpeg(1);
    const before = new Uint8Array(original);
    const stripped = stripImageMetadata(original, 'image/jpeg');
    expect(stripped.removed).toEqual(['EXIF','XMP','Photoshop']);
    expect(stripped.bytes.length).toBeLessThan(original.length);
    expect(metadata('image/jpeg', stripped.bytes)).toBe('');
    expect(new TextDecoder().decode(stripped.bytes)).toContain('ICC_PROFILE');
    expect([...stripped.bytes.slice(-14)]).toEqual([...original.slice(-14)]);
    expect([...original]).toEqual([...before]);
    expect(stripImageMetadata(stripped.bytes, 'image/jpeg').removed).toEqual([]);
  });

  it('mantém EXIF com orientação 6 para impedir giro involuntário', () => {
    const original = jpeg(6);
    const after = stripImageMetadata(original, 'image/jpeg');
    expect(after.removed).toEqual(['XMP', 'Photoshop']);
    expect(after.skipped).toMatch(/orientação/u);
    expect(metadata('image/jpeg', after.bytes)).toBe('EXIF');
  });

  it('PNG preserva chunks de pixels e perfil, limpa XMP e eXIf com CRC íntegro', () => {
    const original = png();
    const changed = stripImageMetadata(original, 'image/png');
    expect(changed.removed).toEqual(['EXIF', 'XMP']);
    expect(metadata('image/png', changed.bytes)).toBe('');
    expect(new TextDecoder().decode(changed.bytes)).toContain('IDAT');
    expect(new TextDecoder().decode(changed.bytes)).toContain('Author');
    expect(stripImageMetadata(changed.bytes, 'image/png').removed).toEqual([]);
  });

  it('WebP atualiza RIFF e flags VP8X sem apagar ICC', () => {
    const original = webp();
    const changed = stripImageMetadata(original, 'image/webp');
    expect(changed.removed).toEqual(['EXIF','XMP']);
    expect(metadata('image/webp', changed.bytes)).toBe('');
    const view = new DataView(changed.bytes.buffer);
    expect(view.getUint32(4, true)).toBe(changed.bytes.length - 8);
    expect(changed.bytes[20]).toBe(0x20);
    expect(new TextDecoder().decode(changed.bytes)).toContain('ICCP');
  });

  it('retém bytes diante de PNG truncado e JPEG EXIF não identificável', () => {
    const broken = png().slice(0, 32);
    const changed = stripImageMetadata(broken, 'image/png');
    expect(changed.bytes).toBe(broken);
    expect(changed.removed).toEqual([]);
    const jpegInvalid = join(Uint8Array.of(255,216),
      segment(0xe1, text('Exif\0\0')), Uint8Array.of(255,217));
    const result = stripImageMetadata(jpegInvalid, 'image/jpeg');
    expect(result.bytes).toBe(jpegInvalid);
    expect(result.removed).toEqual([]);
  });
});
