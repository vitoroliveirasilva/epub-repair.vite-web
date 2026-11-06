// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { validateCoverConsistency } from '../src/epub/validation/validateCoverConsistency';
import { validateDeclaredScripts } from '../src/epub/validation/validateDeclaredScripts';
import { detectOrphanResources } from '../src/epub/validation/detectOrphans';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const encoder = new TextEncoder();
function fixture({
  meta = 'cover1',
  image = 'cover1',
  guide = 'cover.xhtml',
  navCover = 'cover.xhtml',
} = {}) {
  const opf = '<package><metadata><meta name="cover" content="' + meta + '"/></metadata>' +
    '<guide><reference type="cover" href="' + guide + '"/></guide></package>';
  const nav = '<html xmlns="http://www.w3.org/1999/xhtml" ' +
    'xmlns:epub="http://www.idpf.org/2007/ops"><body>' +
    '<nav epub:type="landmarks"><ol><li><a epub:type="cover" href="' +
    navCover + '">Capa</a></li></ol></nav></body></html>';
  const entries = new Map([
    ['OPS/book.opf', { bytes: encoder.encode(opf) }],
    ['OPS/nav.xhtml', { bytes: encoder.encode(nav) }],
    ['OPS/cover.xhtml', { bytes: encoder.encode('<html/>') }],
    ['OPS/image1.jpg', { bytes: Uint8Array.of(0xff, 0xd8, 0xff) }],
    ['OPS/image2.jpg', { bytes: Uint8Array.of(0xff, 0xd8, 0xff) }],
  ]);
  const loaded = { files: entries } as unknown as LoadedEpub;
  const item = (id: string, resolvedPath: string, mediaType: string, props: string[] = []) => ({
    id, href: resolvedPath.split('/').at(-1) ?? '', resolvedPath,
    mediaType, properties: props, pathSafe: true, exists: true,
  });
  const pkg = {
    opfPath: 'OPS/book.opf', opfDir: 'OPS', version: '3.3', metadata: {},
    manifest: [
      item('cover1', 'OPS/image1.jpg', 'image/jpeg'),
      item('cover2', 'OPS/image2.jpg', 'image/jpeg', image === 'cover2' ? ['cover-image'] : []),
      item('nav', 'OPS/nav.xhtml', 'application/xhtml+xml', ['nav']),
    ],
    navItem: item('nav', 'OPS/nav.xhtml', 'application/xhtml+xml', ['nav']),
    spine: [], rootfileCount: 1,
  } as PackageDocumentInfo;
  if (image === 'cover1') pkg.manifest[0]!.properties.push('cover-image');
  return { loaded, pkg };
}

describe('E-050: verificar fontes distintas de declarações de capa', () => {
  it('aceita imagem do manifest e página de capa no guide/landmarks, sem forçar path igual', () => {
    const { loaded, pkg } = fixture();
    expect(validateCoverConsistency(loaded, pkg)).toEqual([]);
  });
  it('detecta propriedades cover-image incompatíveis com meta legado', () => {
    const { loaded, pkg } = fixture({ image: 'cover2' });
    expect(validateCoverConsistency(loaded, pkg).map((i) => i.code))
      .toContain('COVER_DECLARATIONS_CONFLICT');
  });
  it('detecta guide ou landmark apontando para arquivo inexistente', () => {
    const { loaded, pkg } = fixture({ guide: 'missing.xhtml', navCover: 'absent.xhtml' });
    const codes = validateCoverConsistency(loaded, pkg).map((i) => i.code);
    expect(codes).toContain('COVER_GUIDE_INVALID_TARGET');
    expect(codes).toContain('COVER_LANDMARK_INVALID_TARGET');
  });
});

describe('E-051: inventário de scripts EPUB3 sem removê-los', () => {
  it('declara scripts no manifest como informação e lista órfãos para revisão', () => {
    const { loaded, pkg } = fixture();
    loaded.files.set('OPS/app.js', { path: 'OPS/app.js', bytes: encoder.encode('console.log("livro");'),
      directory: false });
    loaded.files.set('OPS/extra.mjs', { path: 'OPS/extra.mjs', bytes: encoder.encode('export {};'),
      directory: false });
    pkg.manifest.push({
      id: 'app', href: 'app.js', mediaType: 'application/javascript', properties: [],
      pathSafe: true, exists: true, resolvedPath: 'OPS/app.js',
    });
    const declared = validateDeclaredScripts(loaded, pkg);
    expect(declared).toHaveLength(1);
    expect(declared[0]?.code).toBe('PACKAGE_DECLARED_SCRIPT');
    expect(declared[0]?.severity).toBe('info');
    const orphan = detectOrphanResources(loaded, pkg).filter((x) =>
      x.code === 'PACKAGE_UNDECLARED_SCRIPT');
    expect(orphan.some((x) => x.file === 'OPS/extra.mjs')).toBe(true);
    expect(orphan.every((x) => !x.repairable)).toBe(true);
  });
});
