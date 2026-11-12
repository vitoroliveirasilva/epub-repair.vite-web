import { describe, expect, it } from 'vitest';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import {
  buildKindleChecks, readBookMetadata, readBookPreview, writeBookMetadata,
} from '../src/epub/tools/bookTools';
import { analyzeReview, normalizeRepeatedSpaces } from '../src/converter/reviewSuggestions';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { renderOptionalEpubTools } from '../src/ui/optionalEpubTools';
import { createInitialState } from '../src/app/state';
import type { PdfAnalysisResult } from '../src/converter/model';

describe('v4 ferramentas opt-in', () => {
  it('mantém o painel fechado e não executa tarefas quando a aplicação inicia', () => {
    const el = renderOptionalEpubTools(createInitialState(), () => {},
      () => { throw new Error('Processamento não deveria começar.'); });
    expect(el.tagName).toBe('DETAILS');
    expect((el as HTMLDetailsElement).open).toBe(false);
    expect(el.textContent).toContain('Ferramentas extras');
  });

  it('permite prévia segura de texto na ordem do spine, sem HTML ativo', async () => {
    const bytes = await buildKindleIssueEpub();
    const preview = await readBookPreview('teste.epub', bytes);
    expect(preview.sections.length).toBe(2);
    expect(preview.sections[0]?.title).toContain('Capítulo 1');
    expect(preview.sections[0]?.text).toContain('Texto com entidade');
    expect(preview.sections[0]?.text).not.toContain('<img');
  });

  it('carrega metadados e só gera cópia após alteração explícita', async () => {
    const bytes = await buildKindleIssueEpub();
    const meta = await readBookMetadata('teste.epub', bytes);
    expect(meta.title).toBe('Fixture Kindle Safe');
    await expect(writeBookMetadata('teste.epub', bytes, {})).rejects.toThrow('Nenhuma alteração');
    const result = await writeBookMetadata('teste.epub', bytes, { title: 'Edição segura' });
    expect(result.fileName).toBe('teste-metadados.epub');
    const copy = result.bytes;
    const updated = await readBookMetadata(result.fileName, copy);
    expect(updated.title).toBe('Edição segura');
    expect(meta.title).toBe('Fixture Kindle Safe');
  });

  it('oferece checklist Kindle sem declarar certificação', async () => {
    const bytes = await buildKindleIssueEpub();
    const report = await inspectEpub('teste.epub', bytes);
    const checks = buildKindleChecks(report);
    expect(checks.some((check) => check.label === 'Navegação')).toBe(true);
    expect(checks.some((check) => check.label === 'Tamanho para envio web')).toBe(true);
    expect(checks.some((check) => !check.ok)).toBe(true);
  });

  it('identifica pontos de revisão PDF sem alterar o conteúdo automaticamente', () => {
    const analysis = {
      pages: [{ pageNumber: 3, usedOcr: true, ocrConfidence: 52,
        columnCount: 2, preserveAsImage: false, kind: 'scanned' }],
    } as unknown as PdfAnalysisResult;
    const sections = [{ id: 'a', title: 'Teste', plainText: 'palavra   quebrada',
      html: '<p>palavra   quebrada</p>', sourcePages: [3] }];
    const findings = analyzeReview(analysis, sections);
    expect(findings.some((item) => item.code === 'LOW_OCR_CONFIDENCE')).toBe(true);
    expect(findings.some((item) => item.code === 'MULTI_COLUMN')).toBe(true);
    expect(findings.some((item) => item.code === 'SPACING')).toBe(true);
    expect(sections[0]?.plainText).toBe('palavra   quebrada');
    expect(normalizeRepeatedSpaces(sections[0]?.plainText ?? '')).toBe('palavra quebrada');
  });
});
