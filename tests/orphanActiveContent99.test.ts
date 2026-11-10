
import { describe, expect, it } from 'vitest';
import type { LoadedEpub, ValidationReport } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';
import { validateUndeclaredActiveContent } from '../src/epub/validation/validateUndeclaredActiveContent';
import { validateCssReferences } from '../src/epub/validation/validateCssReferences';
import { hasResidualActiveContent, hasManualReviewIssues } from '../src/epub/utils/reportGuards';

const encoded = (text: string) => new TextEncoder().encode(text);
const loaded = (files: Array<[string, string]>) => ({
  files: new Map(files.map(([path, content]) => [path, {
    path, bytes: encoded(content), directory: false,
  }])),
}) as unknown as LoadedEpub;

describe('E-051/E-052: recursos ativos não declarados não ficam invisíveis', () => {
  const pkg = { manifest: [] } as unknown as PackageDocumentInfo;
  it('encontra script em XHTML órfão sem apagar o conteúdo', () => {
    const source = loaded([['OPS/hidden.xhtml',
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><script>alert(1)</script></body></html>']]);
    const issues = validateUndeclaredActiveContent(source, pkg);
    expect(issues.map((x) => x.code)).toContain('PACKAGE_UNDECLARED_ACTIVE_CONTENT');
    expect(source.files.has('OPS/hidden.xhtml')).toBe(true);
    const report = { issues } as ValidationReport;
    expect(hasResidualActiveContent(report)).toBe(true);
    expect(hasManualReviewIssues(report)).toBe(true);
  });
  it('identifica SVG órfão com evento e CSS órfão com expressão', () => {
    const source = loaded([
      ['OPS/image.svg', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'],
      ['OPS/styles.css', 'p{width: expression(alert(1));}'],
    ]);
    expect(validateUndeclaredActiveContent(source, pkg)).toHaveLength(2);
  });
  it('não cria falso risco por HTTP/HTTPS legítimo em recurso órfão', () => {
    const source = loaded([
      ['OPS/page.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
        '<a href="https://example.com">Link</a></body></html>'],
      ['OPS/fonts.css', '@font-face{src:url(https://example.com/font.woff2)}'],
    ]);
    expect(validateUndeclaredActiveContent(source, pkg)).toEqual([]);
  });

  it('detecta style perigoso, meta refresh, srcdoc e srcset executável em órfãos', () => {
    const source = loaded([
      ['OPS/with-style.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><head>' +
        '<style>p{width:expression(alert(1));}</style></head><body><p>Texto</p></body></html>'],
      ['OPS/refresh.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><head>' +
        '<meta http-equiv="refresh" content="0;url=javascript:alert(1)"/></head><body/></html>'],
      ['OPS/srcdoc.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
        '<p srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;">Teste</p></body></html>'],
      ['OPS/picture.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
        '<img srcset="javascript:alert(1) 1x, https://example.org/capa.jpg 2x" /></body></html>'],
    ]);
    const warnings = validateUndeclaredActiveContent(source, pkg);
    expect(warnings).toHaveLength(4);
    expect(warnings.every((issue) => !issue.repairable)).toBe(true);
  });
  it('não marca como ativo um comentário com script nem uma fonte remota legal', () => {
    const source = loaded([
      ['OPS/notes.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
        '<!-- <script>alert(1)</script> --><p>Fragmento editorial</p></body></html>'],
      ['OPS/format.css', '@font-face{src:url("https://example.org/font.woff2")}'],
    ]);
    expect(validateUndeclaredActiveContent(source, pkg)).toEqual([]);
  });
  it('recursos de texto com bytes malformados exigem revisão, não um falso parecer limpo', () => {
    const source = loaded([['OPS/notes.xhtml', '<html/>']]);
    source.files.get('OPS/notes.xhtml')!.bytes = Uint8Array.of(0xff, 0xfe, 0x3c, 0x00);
    expect(validateUndeclaredActiveContent(source, pkg)
      .map((issue) => issue.code)).toContain('PACKAGE_UNDECLARED_ACTIVE_CONTENT');
  });

  it('inspeção do CSS declarado identifica expression() sem o classificar como remoto', () => {
    const path = 'OPS/style.css';
    const source = loaded([[path, 'p{width: expression(alert(1));font-size:12px}']]);
    const declared = { manifest: [{
      id: 's', href: 'style.css', mediaType: 'text/css', resolvedPath: path,
      properties: [], pathSafe: true, exists: true,
    }] } as unknown as PackageDocumentInfo;
    expect(validateCssReferences(source, declared).map((x) => x.code))
      .toContain('CSS_UNSAFE_RESOURCE');
  });
});
