// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getWorkflowState } from '../src/app/workflowState';
import { createInitialState } from '../src/app/state';
import { renderControls } from '../src/ui/components/Controls';
import { buildValidationReport } from '../src/epub/utils/reportBuilder';
import type { Issue } from '../src/epub/model/issueTypes';
import type { ValidationReport } from '../src/epub/model/epubTypes';

const issue = (code: Issue['code'], severity: Issue['severity'], repairable: boolean) => ({
  id: code, title: code, detail: code, code, severity, repairable,
});
const makeReport = (issues: Issue[], validZip = true): ValidationReport =>
  buildValidationReport({
    fileName: 'book.epub', fileSize: 500, zipEntries: [], validZip, issues,
  });
const actions = {
  analyze: () => {}, repair: () => {}, copy: () => {},
  downloadTextReport: () => {}, downloadJsonReport: () => {},
};

describe('E-061: scores independentes de estrutura, segurança e compatibilidade', () => {
  it('separa aviso de URL insegura de pontuação estrutural e de compatibilidade', () => {
    const r = makeReport([issue('CONTENT_UNSAFE_URL', 'warning', true)]);
    expect(r.stats.securityScore).toBeLessThan(100);
    expect(r.stats.structureScore).toBe(100);
    expect(r.stats.compatibilityScore).toBe(100);
  });
  it('problemas de OPF afetam estrutura sem mascarar score de segurança', () => {
    const r = makeReport([issue('OPF_MANIFEST_EMPTY', 'fatal', false)]);
    expect(r.stats.structureScore).toBeLessThan(100);
    expect(r.stats.securityScore).toBe(100);
  });
  it('aviso de idioma XHTML não corresponde a ameaça de segurança', () => {
    const r = makeReport([issue('XHTML_LANG_MISSING', 'info', true)]);
    expect(r.stats.compatibilityScore).toBeLessThan(100);
    expect(r.stats.securityScore).toBe(100);
  });
  it('JavaScript EPUB 3 declarado como informação não é malware', () => {
    const r = makeReport([issue('PACKAGE_DECLARED_SCRIPT', 'info', false)]);
    expect(r.stats.securityScore).toBe(100);
  });
});

describe('E-077: estados explícitos do fluxo de reparo', () => {
  it('distingue estados sem upload, inválido, reparável e revisão humana', () => {
    const state = createInitialState();
    expect(getWorkflowState(state)).toBe('empty');
    state.report = makeReport([issue('ZIP_INVALID', 'fatal', false)], false);
    expect(getWorkflowState(state)).toBe('invalid');
    state.report = makeReport([issue('MIME_MISSING', 'error', true)]);
    expect(getWorkflowState(state)).toBe('repairable');
    state.report = makeReport([issue('CONTENT_MISSING_FRAGMENT', 'warning', false)]);
    expect(getWorkflowState(state)).toBe('manual-review');
    expect(renderControls(state, actions).textContent).toContain('Revisão manual necessária');
  });
  it('distingue prontidão, otimização e processamento', () => {
    const state = createInitialState();
    state.report = makeReport([]);
    expect(getWorkflowState(state)).toBe('ready');
    state.report = makeReport([issue('IMAGE_PROGRESSIVE_JPEG', 'info', true)]);
    expect(getWorkflowState(state)).toBe('optimization');
    state.busy = true;
    expect(getWorkflowState(state)).toBe('processing');
  });
  it('classifica saída pela inspeção final e não pelo diagnóstico de origem', () => {
    const state = createInitialState();
    const before = makeReport([issue('CONTENT_SCRIPTED', 'warning', true)]);
    const partial = makeReport([issue('CONTENT_SCRIPTED', 'warning', true)]);
    state.report = before;
    state.repairResult = {
      fileName: 'repaired.epub', before, after: partial, actions: [], warnings: [],
      operation: 'repair', changed: true, blob: new Blob(['epub']),
    };
    expect(getWorkflowState(state)).toBe('partial-output');
    expect(renderControls(state, actions).textContent).toContain('Cópia parcial gerada');
    state.repairResult.after = makeReport([]);
    expect(getWorkflowState(state)).toBe('completed-output');
  });
});
