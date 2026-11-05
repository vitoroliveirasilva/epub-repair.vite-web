// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderControls } from '../src/ui/components/Controls';
import { createInitialState } from '../src/app/state';
import { potentialEditorialChanges } from '../src/app/repairConsent';
import type { AppState } from '../src/app/state';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { parsePackageDocument } from '../src/epub/validation/opfParser';
import { repairOpfDocument } from '../src/epub/repair/repairOpf';
import { buildNcxDocument } from '../src/epub/repair/repairNavigation';
import { validateOpf } from '../src/epub/validation/validateOpf';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';
import { assertNoNewCriticalIssues } from '../src/epub/repair/repairSafety';
import { hasManualReviewIssues, hasResidualActiveContent } from '../src/epub/utils/reportGuards';
import type { ValidationReport } from '../src/epub/model/epubTypes';

const uiActions = {
  analyze: () => {}, repair: () => {}, copy: () => {},
  downloadTextReport: () => {}, downloadJsonReport: () => {},
};

describe('Políticas conservadoras de reparo', () => {
  it('E-078: alerta antes de substituições, sem criar falso risco em URLs normais', () => {
    const state = createInitialState();
    const report = { issues: [
      { code: 'CONTENT_MISSING_RESOURCE' },
      { code: 'CONTENT_SCRIPTED' },
    ] } as unknown as ValidationReport;
    expect(potentialEditorialChanges(state.options, undefined)).toEqual([]);
    expect(potentialEditorialChanges(state.options, report).length).toBe(1);
    state.options.replaceMissingImagesWithText = true;
    state.options.removeRemoteResourceLinks = true;
    expect(potentialEditorialChanges(state.options, report).length).toBe(3);
    state.options.conservativeMode = true;
    expect(potentialEditorialChanges(state.options, report).length).toBe(3);
  });


  it('E-052: não chama cópia com scripts remanescentes de EPUB pronto', () => {
    const state: AppState = createInitialState();
    const report = {
      validZip: true, issues: [{
        code: 'CONTENT_SCRIPTED', severity: 'warning', repairable: true,
      }], stats: { fatalCount: 0, errorCount: 0, warningCount: 1 },
    } as unknown as ValidationReport;
    state.report = report;
    state.repairResult = {
      blob: new Blob(['epub']), fileName: 'teste-corrigido.epub',
      before: report, after: report, actions: [], warnings: [], changed: true,
      operation: 'repair',
    };
    const ui = renderControls(state, uiActions);
    expect(ui.textContent).toContain('Cópia parcial gerada: revisão manual necessária');
    expect(ui.textContent).toContain('Baixar cópia parcial (revisar)');
    expect(ui.textContent).not.toContain('EPUB corrigido pronto');
  });


  it('E-052: status pós-reparo usa o relatório final, não alertas já resolvidos', () => {
    const state: AppState = createInitialState();
    const before = {
      validZip: true, issues: [{ code: 'CONTENT_SCRIPTED', severity: 'warning',
        repairable: true }], stats: { fatalCount: 0, errorCount: 0, warningCount: 1 },
    } as unknown as ValidationReport;
    const after = {
      validZip: true, issues: [], stats: { fatalCount: 0, errorCount: 0, warningCount: 0 },
    } as unknown as ValidationReport;
    state.report = before;
    state.repairResult = {
      blob: new Blob(['epub']), fileName: 'teste-corrigido.epub',
      before, after, actions: [], warnings: [], changed: true,
      operation: 'repair',
    };
    const ui = renderControls(state, uiActions);
    expect(ui.textContent).toContain('EPUB corrigido pronto');
    expect(ui.textContent).toContain('Baixar EPUB corrigido');
    expect(ui.textContent).not.toContain('Cópia parcial');
  });

  it('E-079: operação somente pulada não anuncia download inexistente', () => {
    const state: AppState = createInitialState();
    const report = {
      validZip: true, issues: [{ code: 'OPF_FALLBACK_MISSING',
        severity: 'warning', repairable: false }],
      stats: { fatalCount: 0, errorCount: 0, warningCount: 1 },
    } as unknown as ValidationReport;
    state.report = report;
    state.repairResult = {
      fileName: 'teste.epub', before: report, after: report,
      actions: [{ type: 'skipped', title: 'Sem reparo', detail: 'Revisar' }],
      warnings: [], changed: false, operation: 'repair',
    };
    const ui = renderControls(state, uiActions);
    expect(ui.textContent).toContain('Revisão manual necessária');
    expect(ui.textContent).not.toContain('EPUB corrigido pronto');
  });


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

  it('E-052: conteúdo ativo não neutralizado permanece revisão manual', () => {
    const report = { issues: [{
      code: 'CONTENT_SCRIPTED', severity: 'warning', repairable: true,
    }] } as unknown as ValidationReport;
    expect(hasResidualActiveContent(report)).toBe(true);
    expect(hasManualReviewIssues(report)).toBe(true);
  });

  it('E-006: novo aviso de navegação impede exportação como reparo íntegro', () => {
    const base = { validZip: true, stats: { fatalCount: 0 }, issues: [] } as unknown as ValidationReport;
    const broken = { validZip: true, stats: { fatalCount: 0 }, issues: [{
      code: 'NAV_INVALID', severity: 'warning', file: 'OPS/nav.xhtml',
    }] } as unknown as ValidationReport;
    expect(() => assertNoNewCriticalIssues(base, broken)).toThrow(/novos erros ou avisos/u);
  });

  it('E-019: rejeita novos erros críticos após operações no EPUB', () => {
    const base = { validZip: true, stats: { fatalCount: 0 }, issues: [] } as unknown as ValidationReport;
    const broken = { validZip: true, stats: { fatalCount: 1 }, issues: [{
      code: 'OPF_MISSING', severity: 'fatal', file: 'book.opf',
    }] } as unknown as ValidationReport;
    expect(() => assertNoNewCriticalIssues(base, broken))
      .toThrow(/verificação estrutural final/u);
  });
});
