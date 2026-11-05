// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createTextFileDiffs } from '../src/epub/repair/textFileDiff';
import { renderRepairSummary } from '../src/ui/components/RepairSummary';
import { buildJsonReport, buildTextReport } from '../src/ui/copyReport';
import type { RepairResult } from '../src/epub/model/repairTypes';
import type { ValidationReport } from '../src/epub/model/epubTypes';

const encode = (text: string) => new TextEncoder().encode(text);
describe('E-073: comparação técnica verificável antes/depois do EPUB', () => {
  it('mostra adições e remoções por linha para XHTML, OPF, CSS e NCX', () => {
    const names = ['OPS/chapter.xhtml', 'OPS/style.css', 'OPS/book.opf', 'OPS/toc.ncx'];
    const before = new Map(names.map((name) => [name, encode('linha 1\ntexto original\nlinha 3')]));
    const after = new Map(names.map((name) => [name, encode('linha 1\ntexto revisado\nlinha 3')]));
    const changes = createTextFileDiffs(before, after);
    expect(changes.map((x) => x.path).sort()).toEqual(names.sort());
    expect(changes).toHaveLength(4);
    for (const change of changes) {
      expect(change.preview).toContain('-texto original');
      expect(change.preview).toContain('+texto revisado');
      expect(change.truncated).toBe(false);
    }
  });
  it('ignora recursos binários e arquivos sem modificações', () => {
    const original = new Map([
      ['OPS/book.opf', encode('sem alteração')],
      ['OPS/cover.png', Uint8Array.from([1, 2, 3])],
    ]);
    const final = new Map([
      ['OPS/book.opf', encode('sem alteração')],
      ['OPS/cover.png', Uint8Array.from([4, 5, 6])],
    ]);
    expect(createTextFileDiffs(original, final)).toEqual([]);
  });
  it('omissão segura de prévia para arquivo de texto muito extenso', () => {
    const before = new Map([['OPS/book.opf', encode('a'.repeat(280_000))]]);
    const after = new Map([['OPS/book.opf', encode('b'.repeat(280_000))]]);
    const [change] = createTextFileDiffs(before, after);
    expect(change?.truncated).toBe(true);
    expect(change?.preview).toContain('Prévia omitida');
  });
  it('renderiza diff de modo recolhido e exporta sem interpretar HTML alterado', () => {
    const diffs = createTextFileDiffs(
      new Map([['OPS/chapter.xhtml', encode('<p>Antigo</p>')]]),
      new Map([['OPS/chapter.xhtml', encode('<p>Novo</p>')]]),
    );
    const report = { fileName: 'Livro.epub', issues: [], zipEntries: [], stats: {
      kindleScore: 100, structureScore: 100, compatibilityScore: 100, securityScore: 100,
      fatalCount: 0, errorCount: 0, warningCount: 0, infoCount: 0,
      repairableCount: 0, totalFiles: 2,
    }} as ValidationReport;
    const repair: RepairResult = {
      before: report, after: report, fileName: 'Livro-corrigido.epub',
      operation: 'repair', changed: true, actions: [], warnings: [], fileDiffs: diffs,
    };
    const ui = renderRepairSummary(repair);
    expect(ui.querySelectorAll('.repair-file-diffs details')).toHaveLength(1);
    expect(ui.querySelector('.repair-diff-preview')?.textContent).toContain('+<p>Novo</p>');
    expect(ui.querySelector('.repair-diff-preview p')).toBeNull();
    expect(buildTextReport(report, repair)).toContain('Comparação técnica antes/depois');
    const json = JSON.parse(buildJsonReport(report, repair)) as { repair: RepairResult };
    expect(json.repair.fileDiffs).toHaveLength(1);
  });
});
