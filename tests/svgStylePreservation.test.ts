// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { auditPreservation } from '../src/epub/repair/preservationAudit';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const encode = (value: string) => new TextEncoder().encode(value);
const chapter = (inside: string) =>
  '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
  '<p>Figura da obra</p><svg xmlns="http://www.w3.org/2000/svg">' +
  inside + '</svg></body></html>';
function auditSvg(before: string, after: string) {
  const path = 'OPS/chapter.xhtml';
  const item = { id: 'chapter', resolvedPath: path, exists: true,
    mediaType: 'application/xhtml+xml' };
  const pkg = { manifest: [item], spine: [{ idref: 'chapter',
    manifestItem: item }] } as unknown as PackageDocumentInfo;
  const original = { files: new Map([[path, { bytes: encode(before) }]]) }
    as unknown as LoadedEpub;
  return () => auditPreservation(original, new Map([[path, encode(after)]]), pkg, pkg);
}

describe('integridade da aparência do SVG embutido', () => {
  it('bloqueia mudança visual em style da geometria sem alterar path d', () => {
    const before = chapter('<path style="fill:#008000" d="M0 0L2 2"/>');
    const after = before.replace('fill:#008000', 'fill:#ffffff');
    expect(auditSvg(before, after)).toThrow(/SVG editorial|geometria/u);
  });
  it('bloqueia alteração de CSS seguro em style interno do SVG', () => {
    const before = chapter('<style>.figura{fill:red}</style>' +
      '<path class="figura" d="M0 0L2 2"/>');
    const after = before.replace('.figura{fill:red}', '.figura{fill:transparent}');
    expect(auditSvg(before, after)).toThrow(/SVG editorial|geometria/u);
  });
  it('autoriza modificação textual sem tocar aparência ou geometria', () => {
    const before = chapter('<path style="fill:red" d="M0 0L2 2"/>');
    const after = before.replace('Figura da obra', 'Figura da obra [Legenda adicionada]');
    expect(auditSvg(before, after)()).toEqual(expect.arrayContaining([
      expect.stringMatching(/acréscimos/u),
    ]));
  });
  it('ignora script ativo removido e preserva style SVG seguro', () => {
    const before = chapter('<style>.p{fill:red}</style><path class="p" d="M0 0L2 2"/>' +
      '<script>alert(1)</script>');
    const after = before.replace('<script>alert(1)</script>', '');
    expect(auditSvg(before, after)()).toEqual([]);
  });
  it('não aceita mudança de atributos SVG sem autorização', () => {
    const before = chapter('<rect width="2" height="3" style="stroke:blue"/>');
    const after = before.replace('stroke:blue', 'stroke:none');
    expect(auditSvg(before, after)).toThrow();
  });
});
