
import { describe, expect, it } from 'vitest';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { inspectEpub, inspectLoadedEpub } from '../src/epub/validation/validateEpub';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';

const signature = (issues: Awaited<ReturnType<typeof inspectEpub>>['issues']) =>
  issues.map((i) => [i.code, i.file, i.context, i.severity, i.repairable]);

describe('E-031: inspeção sem duplicar descompactação ZIP no reparo', () => {
  it('relatório reutilizando loaded é equivalente ao fluxo independente', async () => {
    const data = await buildKindleIssueEpub();
    const loaded = await loadEpub('book.epub', data);
    const reused = inspectLoadedEpub('book.epub', data.byteLength, loaded);
    const regular = await inspectEpub('book.epub', data);
    expect(signature(reused.issues)).toEqual(signature(regular.issues));
    expect(reused.stats).toEqual(regular.stats);
    expect(reused.validZip).toBe(regular.validZip);
    expect(reused.fileSize).toBe(data.byteLength);
  });
  it('mantém comportamento de ZIP inválido sem reabrir arquivo', async () => {
    const input = Uint8Array.of(0x50, 0x4b, 0x00, 0x00);
    const loaded = await loadEpub('invalid.epub', input);
    const report = inspectLoadedEpub('invalid.epub', input.length, loaded);
    expect(report.validZip).toBe(false);
    expect(report.issues.some((i) => i.severity === 'fatal')).toBe(true);
  });
});
