import { describe, expect, it } from 'vitest';
import { inlineRunsOf } from '../src/epub/tools/readerInline';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { readBookPreview } from '../src/epub/tools/bookTools';

describe('Marcação de leitura EPUB 4', () => {
  it('mantém negrito/itálico aninhados e quebras sem incluir conteúdo ativo', () => {
    const xml = new DOMParser().parseFromString(
      '<p xmlns="http://www.w3.org/1999/xhtml">Um ' +
      '<strong>trecho <em>importante</em></strong> antes<br/>depois' +
      '<script>roubo-de-conteudo</script><img src="https://example.org/" /></p>',
      'application/xml',
    );
    const runs = inlineRunsOf(xml.documentElement);
    const text = runs.map((run) => run.text).join('');
    expect(text).toContain('Um trecho importante antes\ndepois');
    expect(text).not.toContain('roubo-de-conteudo');
    expect(runs.some((run) => run.text.includes('importante') &&
      run.marks.includes('strong') && run.marks.includes('emphasis'))).toBe(true);
    expect(runs.some((run) => run.text.includes('\n'))).toBe(true);
  });

  it('limita a complexidade do XHTML para não esgotar a memória', () => {
    const xml = new DOMParser().parseFromString(
      '<p>' + '<em>A</em>'.repeat(3000) + '</p>', 'application/xml');
    const runs = inlineRunsOf(xml.documentElement);
    expect(runs.length).toBeLessThanOrEqual(1000);
    expect(runs.map((run) => run.text).join('').length).toBeLessThanOrEqual(20_000);
  });

  it('mantém a prévia funcional em XHTML legado', async () => {
    const bytes = await buildKindleIssueEpub();
    const preview = await readBookPreview('legado.epub', bytes);
    expect(preview.sections[0]?.title).toContain('Capítulo 1');
    expect(preview.sections[0]?.text).not.toContain('<script');
  });
});
