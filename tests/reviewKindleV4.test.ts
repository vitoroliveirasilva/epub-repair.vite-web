import { describe, expect, it } from 'vitest';
import type { EditableSection, PdfAnalysisResult } from '../src/converter/model';
import type { ValidationReport } from '../src/epub/model/epubTypes';
import {
  analyzeReview, buildReviewAudit, exportReviewAudit, reviewFindingKey,
  normalizeHtmlTextSpaces, normalizeSectionSpaces, normalizeRepeatedSpaces,
} from '../src/converter/reviewSuggestions';
import {
  buildKindleChecks, summarizeKindleChecks, exportKindleReadiness,
} from '../src/epub/tools/bookTools';

function section(text: string, html: string, page = 3): EditableSection {
  return { id: 'section-1', title: 'Capítulo', plainText: text, html, sourcePages: [page] };
}

function pdf(pages: Array<Partial<PdfAnalysisResult['pages'][number]>>): PdfAnalysisResult {
  return { pages: pages.map((page, index) => ({
    pageNumber: index + 1, width: 600, height: 800, text: '', lines: [],
    nativeCharacters: 0, usedOcr: false, columnCount: 1, imageCount: 0,
    kind: 'text' as const, preserveAsImage: false, ...page,
  })) } as PdfAnalysisResult;
}

function report(): ValidationReport {
  return {
    fileName: 'obra.epub', fileSize: 1_000_000, generatedAt: '2026-11-12',
    validZip: true, issues: [], zipEntries: [],
    packageInfo: {
      opfPath: 'OPS/package.opf', opfDir: 'OPS', rootfileCount: 1, version: '3.0',
      metadata: { title: 'Obra', language: 'pt-BR', identifier: 'urn:isbn:123' },
      manifest: [], spine: [{ idref: 'chapter' }],
      navItem: { id: 'nav', href: 'nav.xhtml', mediaType: 'application/xhtml+xml',
        properties: ['nav'], resolvedPath: 'OPS/nav.xhtml', pathSafe: true, exists: true },
    },
    cover: { declared: true, exists: true, source: 'opf-meta' },
    stats: { totalFiles: 6, fatalCount: 0, errorCount: 0, warningCount: 0,
      infoCount: 0, repairableCount: 0, kindleScore: 100,
      structureScore: 100, securityScore: 100, compatibilityScore: 100 },
  };
}

describe('Revisor PDF orientado por prioridade', () => {
  it('ordena casos relevantes, inclui evidências e mantém o conteúdo intacto', () => {
    const source = section('Uma palavra � ruim   aqui', '<p>Uma palavra � ruim   aqui</p>');
    const original = structuredClone(source);
    const analysis = pdf([{ pageNumber: 3, usedOcr: true, ocrConfidence: 42,
      columnCount: 2, text: 'Texto obtido com alguns erros por reconhecimento de imagem.' }]);
    const result = analyzeReview(analysis, [source]);
    expect(result.map((item) => item.code)).toEqual([
      'LOW_OCR_CONFIDENCE', 'UNREADABLE_CHARACTER', 'MULTI_COLUMN', 'SPACING',
    ]);
    expect(result[0]?.priority).toBe('high');
    expect(result[0]?.reason).toContain('42%');
    expect(result[1]?.evidence).toContain('�');
    expect(source).toEqual(original);
  });

  it('sinaliza texto de página sem destino, sem tratar como perda comprovada', () => {
    const analysis = pdf([{ pageNumber: 8, nativeCharacters: 450,
      text: 'Conteúdo original.'.repeat(30) }]);
    const result = analyzeReview(analysis, [section('Outro capítulo', '<p>Outro capítulo</p>')]);
    expect(result.find((item) => item.code === 'PAGE_NOT_LINKED')?.priority).toBe('high');
    expect(result.find((item) => item.code === 'PAGE_NOT_LINKED')?.reason)
      .toContain('Confira');
  });

  it('não gera alerta de perda para página de imagem preservada ou pouco texto', () => {
    const analysis = pdf([
      { pageNumber: 1, kind: 'visual', preserveAsImage: true,
        text: 'Imagem com texto'.repeat(30) },
      { pageNumber: 2, kind: 'text', text: 'Texto curto' },
    ]);
    const result = analyzeReview(analysis, []);
    expect(result.some((item) => item.code === 'PAGE_NOT_LINKED')).toBe(false);
  });

  it('preserva tags, atributos, ênfases, imagens e trechos de código', () => {
    const html = '<p class="name   with  spaces">Texto   com <em>ênfase   importante</em></p>' +
      '<figure><img src="fig.png" alt="Uma   imagem" /></figure>' +
      '<pre>    alinhamento   intencional</pre><code>valor   fixo</code>';
    const normalized = normalizeHtmlTextSpaces(html);
    expect(normalized).toContain('class="name   with  spaces"');
    expect(normalized).toContain('Texto com <em>ênfase importante</em>');
    expect(normalized).toContain('src="fig.png" alt="Uma   imagem"');
    expect(normalized).toContain('<pre>    alinhamento   intencional</pre>');
    expect(normalized).toContain('<code>valor   fixo</code>');
    const original = section('Texto   com ênfase   importante', html);
    const fixed = normalizeSectionSpaces(original);
    expect(fixed.plainText).toBe('Texto com ênfase importante');
    expect(fixed.html).toBe(normalized);
    expect(original.html).toBe(html);
    expect(normalizeRepeatedSpaces('um    texto')).toBe('um texto');
  });

  it('mostra contagens exatas apesar do limite de 60 alertas e exporta o diagnóstico completo', () => {
    const pages = Array.from({ length: 75 }, (_, index) => ({
      pageNumber: index + 1, columnCount: 2,
      nativeCharacters: 350,
      text: 'Página com duas colunas e parágrafos que exigem revisão.',
    }));
    const analysis = pdf(pages);
    const audit = buildReviewAudit(analysis, []);
    expect(audit.total).toBe(75);
    expect(audit.displayed).toBe(60);
    expect(audit.omitted).toBe(15);
    expect(audit.medium).toBe(75);
    expect(audit.high).toBe(0);
    expect(analyzeReview(analysis, [])).toHaveLength(60);
    const first = audit.findings[0]!;
    const marked = new Set([reviewFindingKey(first)]);
    const parsed = JSON.parse(exportReviewAudit(analysis, [], marked)) as {
      summary: { total: number; reviewed: number };
      findings: Array<{ code: string; reviewed: boolean }>;
    };
    expect(parsed.summary.total).toBe(75);
    expect(parsed.summary.reviewed).toBe(1);
    expect(parsed.findings).toHaveLength(75);
    expect(parsed.findings[0]?.reviewed).toBe(true);
    expect(parsed.findings.slice(1).every((finding) => !finding.reviewed)).toBe(true);
  });

  it('sinaliza figuras perdidas na conversão e confirma as que foram mantidas', () => {
    const page = {
      pageNumber: 1, figures: [
        { id: 'figure-0001-01', pageNumber: 1, x: 50, y: 150,
          width: 200, height: 180, dataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
        { id: 'figure-0001-02', pageNumber: 1, x: 80, y: 400,
          width: 200, height: 180, dataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
      ],
    };
    const source = { id: 'section-1', title: 'Capítulo', sourcePages: [1],
      plainText: 'Texto e imagens',
      html: '<p>Texto e imagens</p><img src="../Images/figure-0001-01.jpg"/>' };
    const result = analyzeReview(pdf([page]), [source]);
    expect(result.filter((finding) => finding.code === 'FIGURES_NOT_LINKED'))
      .toHaveLength(1);
    expect(result.find((finding) => finding.code === 'FIGURES_NOT_LINKED')?.evidence)
      .toContain('figure-0001-02');
    const complete = { ...source,
      html: source.html + '<img src="../Images/figure-0001-02.jpg"/>' };
    expect(analyzeReview(pdf([page]), [complete])
      .some((finding) => finding.code === 'FIGURES_NOT_LINKED')).toBe(false);
  });

  it('não reporta como perda textual páginas sem associação confiável por ter seção multipágina', () => {
    const lines = Array.from({ length: 9 }, (_, index) => ({
      text: 'Conteúdo extraído longo e relevante da página número ' +
        (index + 1) + ' com textos diferentes.',
      x: 50, y: 700 - index * 25, width: 430, fontSize: 12, fontName: 'body',
    }));
    const analysis = pdf([{ pageNumber: 1, lines, text: lines.map((line) =>
      line.text).join('\n') }]);
    const source = { id: 'seção-multipágina', title: 'Capítulo longo',
      plainText: 'A sequência foi distribuída em diferentes páginas.',
      html: '<p>A sequência foi distribuída em diferentes páginas.</p>',
      sourcePages: [1, 2] };
    const result = analyzeReview(analysis, [source]);
    expect(result.some((finding) => finding.code === 'POSSIBLE_TEXT_LOSS')).toBe(false);
  });

  it('não altera seções que não exigem correção', () => {
    const original = section('Texto regular', '<p>Texto regular</p>');
    expect(normalizeSectionSpaces(original)).toBe(original);
  });
});

describe('Checklist de riscos para Kindle', () => {
  it('reconhece dados estruturais positivos sem declarar certificação', () => {
    const checks = buildKindleChecks(report());
    expect(checks).toHaveLength(10);
    expect(checks.find((item) => item.label === 'Navegação')?.ok).toBe(true);
    expect(checks.find((item) => item.label === 'Metadados essenciais')?.ok).toBe(true);
    expect(summarizeKindleChecks(checks)).toEqual({
      status: 'ready', ready: 10, review: 0, blocked: 0,
    });
  });

  it('informa pendências acionáveis de metadados, recursos e conteúdo remoto', () => {
    const sample = report();
    sample.packageInfo!.metadata = { title: '', language: '', identifier: '' };
    sample.packageInfo!.navItem = undefined;
    sample.packageInfo!.manifest = [
      { id: 'remote', href: 'https://cdn.example.org/chap.xhtml',
        mediaType: 'application/xhtml+xml', properties: [],
        resolvedPath: '', pathSafe: false, exists: false, remote: true },
      { id: 'missing', href: 'style.css', mediaType: 'text/css',
        properties: [], resolvedPath: 'OPS/style.css', pathSafe: true, exists: false },
    ];
    sample.cover = { declared: false, exists: true, source: 'candidate' };
    const checks = buildKindleChecks(sample);
    expect(checks.find((item) => item.label === 'Metadados essenciais')?.detail)
      .toContain('título, idioma, identificador');
    expect(checks.find((item) => item.label === 'Recursos e dependências')?.ok).toBe(false);
    expect(checks.find((item) => item.label === 'Conteúdo externo ou ativo')?.ok).toBe(false);
    expect(checks.find((item) => item.label === 'Navegação')?.ok).toBe(false);
    expect(checks.filter((item) => !item.ok).every((item) => item.action.length > 10))
      .toBe(true);
    expect(summarizeKindleChecks(checks).status).toBe('review');
  });

  it('trata DRM e entradas criptografadas como bloqueio de envio, não simples aviso', () => {
    const sample = report();
    sample.issues.push({
      id: 'locked', code: 'DRM_OR_ENCRYPTION', severity: 'warning',
      title: 'Protegido', detail: 'Conteúdo protegido por DRM', repairable: false,
    });
    sample.stats.warningCount = 1;
    const checks = buildKindleChecks(sample);
    const security = checks.find((item) => item.label === 'Conteúdo externo ou ativo');
    expect(security?.status).toBe('blocked');
    expect(security?.detail).toContain('DRM');
    expect(summarizeKindleChecks(checks).status).toBe('blocked');
    expect(checks.find((item) => item.label === 'Alertas residuais')?.status).toBe('review');
  });

  it('identifica acessibilidade e layout, inclusive informações que exigem atenção', () => {
    const sample = report();
    sample.issues.push({
      id: 'alt', code: 'CONTENT_IMAGE_ALT_MISSING', severity: 'warning',
      title: 'Alt ausente', detail: 'Ilustração sem descrição', repairable: false,
    }, {
      id: 'layout', code: 'FIXED_LAYOUT_MISSING_VIEWPORT', severity: 'warning',
      title: 'Viewport ausente', detail: 'Página visual sem viewport', repairable: false,
    });
    sample.stats.warningCount = 2;
    const checks = buildKindleChecks(sample);
    expect(checks.find((item) => item.label === 'Acessibilidade')?.status).toBe('review');
    expect(checks.find((item) => item.label === 'Layout e formatos especiais')?.status)
      .toBe('review');
    expect(checks.find((item) => item.label === 'Recursos e dependências')?.status)
      .toBe('ready');
  });

  it('não declara EPUB pronto sem pacote OPF ou ordem de leitura', () => {
    const sample = report();
    sample.packageInfo = undefined;
    const checks = buildKindleChecks(sample);
    expect(checks.find((item) => item.label === 'Estrutura válida')?.status).toBe('blocked');
    expect(checks.find((item) => item.label === 'Navegação')?.status).toBe('review');
    expect(checks.find((item) => item.label === 'Metadados essenciais')?.status).toBe('review');
  });

  it('exporta um laudo estruturado com recomendações e ressalva explícita', () => {
    const sample = report();
    const exported = JSON.parse(exportKindleReadiness(sample)) as {
      source: { fileName: string; epubVersion: string };
      summary: { status: string };
      checks: Array<{ label: string; action: string }>;
      guidance: { automatedUpload: boolean; webLimitBytes: number; limitations: string };
    };
    expect(exported.source.fileName).toBe('obra.epub');
    expect(exported.source.epubVersion).toBe('3.0');
    expect(exported.summary.status).toBe('ready');
    expect(exported.checks).toHaveLength(10);
    expect(exported.checks.every((item) => item.action.length > 10)).toBe(true);
    expect(exported.guidance.webLimitBytes).toBe(200 * 1024 * 1024);
    expect(exported.guidance.automatedUpload).toBe(false);
    expect(exported.guidance.limitations).toMatch(/Kindle|Amazon/u);
  });

  it('distingue ZIP inválido e tamanho excessivo dos alertas menores', () => {
    const sample = report();
    sample.validZip = false;
    sample.fileSize = 210 * 1024 * 1024;
    const checks = buildKindleChecks(sample);
    expect(checks.find((item) => item.label === 'Estrutura válida')?.status).toBe('blocked');
    expect(checks.find((item) => item.label === 'Tamanho para envio web')?.status).toBe('blocked');
    expect(summarizeKindleChecks(checks).blocked).toBe(2);
  });
});
