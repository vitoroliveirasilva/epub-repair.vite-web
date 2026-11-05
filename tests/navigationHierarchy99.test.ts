// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { validateNavigation } from '../src/epub/validation/validateNavigation';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

function validate(inner: string) {
  const path = 'OPS/nav.xhtml';
  const doc = '<html xmlns="http://www.w3.org/1999/xhtml" ' +
    'xmlns:epub="http://www.idpf.org/2007/ops"><body>' +
    '<nav epub:type="toc"><ol>' + inner + '</ol></nav></body></html>';
  const loaded = { files: new Map([[path, { bytes: new TextEncoder().encode(doc) }]]) } as unknown as LoadedEpub;
  const item = { id: 'nav', href: 'nav.xhtml', mediaType: 'application/xhtml+xml',
    properties: ['nav'], resolvedPath: path, pathSafe: true, exists: true };
  const pkg = { opfPath: 'OPS/book.opf', opfDir: 'OPS', version: '3.3', metadata: {},
    manifest: [item], navItem: item, spine: [], rootfileCount: 1 } as PackageDocumentInfo;
  return validateNavigation(loaded, pkg).map((issue) => issue.code);
}

describe('E-038: hierarquia válida em nav.xhtml', () => {
  it('preserva sumário hierárquico com labels span e seções internas legítimas', () => {
    const codes = validate('<li><span>Parte 1</span><ol>' +
      '<li><a href="chapter.xhtml#cap1">Capítulo 1</a></li>' +
      '<li><a href="chapter.xhtml#cap2">Capítulo 2</a></li>' +
      '</ol></li>');
    expect(codes).not.toContain('NAV_INVALID_STRUCTURE');
    expect(codes).not.toContain('NAV_EMPTY');
  });
  it('recusa li com outra lista sem o primeiro rótulo', () => {
    expect(validate('<li><ol><li><a href="chapter.xhtml">Texto</a></li></ol></li>'))
      .toContain('NAV_INVALID_STRUCTURE');
  });
  it('recusa âncora vazia e contêineres que ocultam a estrutura', () => {
    expect(validate('<li><a href="">Vazio</a></li>'))
      .toContain('NAV_INVALID_STRUCTURE');
    expect(validate('<li><div><a href="chapter.xhtml">Falso nível</a></div></li>'))
      .toContain('NAV_INVALID_STRUCTURE');
  });
  it('não confunde nav opcional com sumário obrigatório por arquivo', () => {
    expect(validate('<li><a href="chapter.xhtml">Capítulo principal</a></li>'))
      .not.toContain('NAV_INVALID_STRUCTURE');
  });
});
