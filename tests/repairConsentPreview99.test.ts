// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildRepairConsentMessage } from '../src/app/repairConsent';
import { DEFAULT_REPAIR_OPTIONS } from '../src/epub/utils/constants';
import type { ValidationReport } from '../src/epub/model/epubTypes';

describe('E-078: prévia de risco editorial antes da ação', () => {
  const report = { issues: [
    { code: 'CONTENT_UNSAFE_EMBED', file: 'OPS/chapter.xhtml' },
    { code: 'CONTENT_SCRIPTED', file: 'OPS/notes.xhtml' },
  ] } as unknown as ValidationReport;
  it('mostra categorias e arquivos atingidos no aviso', () => {
    const message = buildRepairConsentMessage(DEFAULT_REPAIR_OPTIONS, report);
    expect(message).toContain('Recursos interativos');
    expect(message).toContain('Scripts, eventos');
    expect(message).toContain('OPS/chapter.xhtml');
    expect(message).toContain('OPS/notes.xhtml');
    expect(message).toContain('nova cópia');
  });
  it('não mostra confirmação falsa quando não há efeitos destrutivos previstos', () => {
    expect(buildRepairConsentMessage(DEFAULT_REPAIR_OPTIONS, { issues: [] } as unknown as ValidationReport))
      .toBeUndefined();
  });
  it('limita arquivo listado para não inundar diálogo em livros grandes', () => {
    const issues = Array.from({ length: 16 }, (_, index) =>
      ({ code: 'CONTENT_SCRIPTED', file: 'OPS/Text/' + index + '.xhtml' }));
    const message = buildRepairConsentMessage(DEFAULT_REPAIR_OPTIONS,
      { issues } as unknown as ValidationReport);
    expect(message).toContain('e mais 8 arquivo(s)');
  });
});
