// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { parsePackageDocument } from '../src/epub/validation/opfParser';
import { repairOpfDocument } from '../src/epub/repair/repairOpf';
import { buildNcxDocument } from '../src/epub/repair/repairNavigation';
import { validateOpf } from '../src/epub/validation/validateOpf';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';
import { assertNoNewCriticalIssues } from '../src/epub/repair/repairSafety';
import type { ValidationReport } from '../src/epub/model/epubTypes';

describe('Políticas conservadoras de reparo', () => {
  it('E-008: não substitui idioma UND por pt-BR sem evidência', async () => {
    const loaded = await loadEpub('book.epub', await buildKindleIssueEpub());
    const pkg = parsePackageDocument(loaded).packageInfo;
    expect(pkg).toBeDefined();
    if (!pkg) return;
    const issues = validateOpf(pkg, loaded);
    expect(issues.some((issue) => issue.code === 'OPF_LANGUAGE_INVALID' && !issue.repairable))
      .toBe(true);
    const repaired = repairOpfDocument(loaded, pkg, 'book.epub', DEFAULT_REPAIR_OPTIONS);
    const dom = new DOMParser().parseFromString(repaired.opfText, 'application/xml');
    const language = Array.from(dom.getElementsByTagName('*'))
      .find((element) => element.localName === 'language');
    expect(language?.textContent).toBe('UND');
  });

  it('E-012: recusa um NCX sem qualquer destino válido', () => {
    const packageData = {
      opfPath: 'OPS/book.opf', opfDir: 'OPS', version: '2.0',
      metadata: {}, manifest: [], spine: [], rootfileCount: 1,
    };
    expect(() => buildNcxDocument(packageData, 'OPS/toc.ncx'))
      .toThrow(/sem destino/u);
  });

  it('E-019: rejeita novos erros críticos após operações no EPUB', () => {
    const base = { issues: [] } as unknown as ValidationReport;
    const broken = { issues: [{
      code: 'OPF_MISSING', severity: 'fatal', file: 'book.opf',
    }] } as unknown as ValidationReport;
    expect(() => assertNoNewCriticalIssues(base, broken))
      .toThrow(/novos problemas críticos/u);
  });
});
