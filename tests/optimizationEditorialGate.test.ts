import { describe, expect, it } from 'vitest';
import { auditPreservation } from '../src/epub/repair/preservationAudit';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

function mockJpeg(sofMarker: number): Uint8Array {
  // Cabeçalho JPEG mínimo suficiente para testar o marcador SOF.
  return Uint8Array.from([
    0xff, 0xd8, 0xff, sofMarker, 0x00, 0x0b,
    0x08, 0x00, 0x10, 0x00, 0x10, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9, 0x00,
  ]);
}

function runAudit(originalBytes: Uint8Array, outputBytes: Uint8Array,
  mime: string, consent = new Set<string>()) {
  const path = 'OPS/images/cover.jpg';
  const item = { id: 'cover', exists: true, resolvedPath: path, mediaType: mime };
  const pkg = { manifest: [item], spine: [] } as unknown as PackageDocumentInfo;
  const original = {
    files: new Map([[path, { bytes: originalBytes }]]),
  } as unknown as LoadedEpub;
  return auditPreservation(original, new Map([[path, outputBytes]]), pkg, pkg,
    new Set(), undefined, consent);
}

describe('auditoria editorial também na otimização opcional', () => {
  it('impede alteração de JPEG sem autorização explícita', () => {
    expect(() => runAudit(mockJpeg(0xc2), mockJpeg(0xc0), 'image/jpeg'))
      .toThrow(/sem autorização/u);
  });

  it('aceita apenas a conversão JPEG progressivo para baseline registrada', () => {
    expect(runAudit(mockJpeg(0xc2), mockJpeg(0xc0), 'image/jpeg',
      new Set(['OPS/images/cover.jpg']))).toEqual([]);
  });

  it('não aceita mudar uma imagem baseline, ainda que caminho seja autorizado', () => {
    const a = mockJpeg(0xc0);
    const b = new Uint8Array(a);
    b[b.length - 1] = 0x13;
    expect(() => runAudit(a, b, 'image/jpeg', new Set(['OPS/images/cover.jpg'])))
      .toThrow(/sem autorização/u);
  });

  it('não aceita conversão de recurso que não é JPEG', () => {
    expect(() => runAudit(Uint8Array.from([1]), Uint8Array.from([2]),
      'image/png', new Set(['OPS/images/cover.jpg'])))
      .toThrow(/sem autorização/u);
  });

  it('mantém imagens intactas sem emitir avisos', () => {
    const a = mockJpeg(0xc2);
    expect(runAudit(a, new Uint8Array(a), 'image/jpeg')).toEqual([]);
  });
});
