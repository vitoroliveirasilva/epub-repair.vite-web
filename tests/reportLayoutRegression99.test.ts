import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderIssueList } from '../src/ui/components/IssueList';
import { renderRepairSummary } from '../src/ui/components/RepairSummary';
import { renderStatusMessage } from '../src/ui/components/ErrorPanel';
import type { ValidationReport, RepairResult } from '../src/epub';

const longPath = 'OPS/Text/' + 'secoes-extremamente-longas/'.repeat(12) + 'capitulo.xhtml';
const manual = {
  id: 'manual', code: 'CONTENT_MISSING_RESOURCE', severity: 'error',
  repairable: false, title: 'Referência ausente',
  detail: 'Um recurso foi perdido. Verifique o capítulo e a referência associada.',
  context: 'Contexto técnico com informações adicionais',
  file: longPath,
};
const repairable = {
  id: 'repairable', code: 'MIME_MISSING', severity: 'warning',
  repairable: true, title: 'Arquivo de identificação ausente', detail: 'O arquivo pode ser reconstruído.',
  file: 'mimetype',
};
const report = {
  fileName: 'teste.epub', validZip: true,
  stats: { kindleScore: 78, fatalCount: 0, errorCount: 1, warningCount: 1,
    infoCount: 0, repairableCount: 1 },
  issues: [manual, repairable],
} as unknown as ValidationReport;

describe('layout do relatório de erros e conferência manual', () => {
  it('exibe aviso e metadados completos no relatório simples e no técnico', () => {
    const simple = renderIssueList(report, 'simple', () => undefined);
    expect(simple.querySelector('.manual-review-notice')?.textContent)
      .toContain('Conferência manual · 1 item');
    expect(simple.querySelectorAll('.simple-issue')).toHaveLength(2);
    expect(simple.querySelectorAll('.simple-issue-labels')).toHaveLength(2);
    expect(simple.querySelector('.simple-issue-location code')?.textContent).toBe(longPath);
    let requestedTechnical = false;
    const interactive = renderIssueList(report, 'simple', () => { requestedTechnical = true; });
    (interactive.querySelector('.manual-review-cta') as HTMLButtonElement).click();
    expect(requestedTechnical).toBe(true);

    const technical = renderIssueList(report, 'technical', () => undefined);
    expect(technical.querySelector('.manual-review-notice')).not.toBeNull();
    expect(technical.querySelector('.issue-group-error')).not.toBeNull();
    expect(technical.querySelector('.issue-group-error')?.hasAttribute('open')).toBe(true);
    expect(technical.querySelector('.issue-meta code:last-child')?.textContent).toBe(longPath);
    expect(technical.querySelector('.issue-title-row .badge-manual')?.textContent)
      .toBe('Conferência manual');
    expect(technical.querySelector('.issue-description')?.textContent).toContain('Um recurso foi perdido');
  });

  it('mostra detalhes úteis e rótulos claros nas pendências depois do reparo', () => {
    const result = {
      before: report, after: report, fileName: 'teste.epub', operation: 'repair',
      changed: true, warnings: [], actions: [{
        type: 'skipped', title: 'Alteração não segura',
        file: 'OPS/Section/' + 'a'.repeat(160) + '.xhtml',
        detail: 'Ação bloqueada para preservar o conteúdo original.',
      }],
    } as RepairResult;
    const output = renderRepairSummary(result);
    const pending = output.querySelector('.repair-pending-issues');
    expect(pending?.hasAttribute('open')).toBe(true);
    expect(pending?.querySelector('.repair-pending-heading strong')?.textContent)
      .toBe('Conferência manual necessária');
    expect(pending?.textContent).toContain('Pendências restantes: 2 · ações não aplicadas: 1');
    expect(pending?.querySelectorAll('.repair-pending-item')).toHaveLength(3);
    expect(pending?.querySelector('.repair-pending-item-error .repair-pending-item-meta code:last-child')?.textContent)
      .toBe(longPath);
    expect(pending?.textContent).toContain('Exige revisão manual');
    expect(pending?.textContent).toContain('O arquivo pode ser reconstruído.');
    expect(pending?.textContent).toContain('Não aplicado: Alteração não segura');
  });

  it('não apresenta aviso manual quando existem somente itens corrigíveis', () => {
    const onlyRepairable = {
      ...report, issues: [repairable],
      stats: { ...report.stats, errorCount: 0 },
    } as unknown as ValidationReport;
    expect(renderIssueList(onlyRepairable, 'simple', () => undefined)
      .querySelector('.manual-review-notice')).toBeNull();
    const result = {
      before: onlyRepairable, after: onlyRepairable,
      fileName: 'teste.epub', operation: 'repair', changed: false, warnings: [], actions: [],
    } as RepairResult;
    expect(renderRepairSummary(result).querySelector('.repair-pending-heading strong')?.textContent)
      .toBe('Conferência do resultado');
  });

  it('mantém mensagens de erro longas legíveis e sem criar HTML arbitrário', () => {
    const error = '<script>alert(1)</script> ' + 'OPS/'.repeat(200);
    const panel = renderStatusMessage(undefined, error)!;
    expect(panel.getAttribute('role')).toBe('alert');
    expect(panel.querySelector('.status-panel-copy p')?.textContent).toBe(error);
    expect(panel.querySelector('script')).toBeNull();
  });

  it('carrega o CSS de correção ao final e contém tratamento responsivo específico', () => {
    const entry = readFileSync('src/main.ts', 'utf8');
    const css = readFileSync('src/styles/reportLayoutFixes.css', 'utf8');
    expect(entry.trimEnd().includes("import './styles/reportLayoutFixes.css';")).toBe(true);
    expect(entry.indexOf("import './styles/reportLayoutFixes.css';"))
      .toBeGreaterThan(entry.indexOf("import './styles/converter.css';"));
    expect(css).toContain('.repair-pending-issues > summary');
    expect(css).toContain('.repair-pending-item');
    expect(css).toContain('.issues-panel .issue-group > summary');
    expect(css).toContain('.issues-panel .issue-meta code');
    expect(css).toContain('@media (max-width: 640px)');
    expect(css).toContain('@media (max-width: 420px)');
    expect(css).toContain('.manual-review-cta');
    expect(css).toContain('.issues-panel .simple-issue-labels');
    expect(css).toContain('.issues-panel .simple-issue-location code');
    const deploy = readFileSync('netlify.toml', 'utf8');
    expect(deploy).toMatch(/Cache-Control = "no-cache, max-age=0, must-revalidate"/u);
  });
});
