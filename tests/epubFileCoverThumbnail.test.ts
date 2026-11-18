import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/app/state';
import { buildValidationReport } from '../src/epub/utils/reportBuilder';
import { getEpubCoverThumbnail } from '../src/ui/epubFileCoverThumbnail';
import { renderUploader } from '../src/ui/components/Uploader';
import { openBatchWithFiles, renderBatchWorkspace } from '../src/ui/optionalEpubTools';
import { EPUB_MIME } from '../src/epub/utils/constants';
import { BASELINE_JPEG_BYTES, buildKindleIssueEpub } from './helpers/syntheticEpub';

function fixtureFile(bytes: Uint8Array, name = 'Livro de teste.epub'): File {
  const file = new File([new Uint8Array(bytes)], name, { type: EPUB_MIME });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new Uint8Array(bytes).buffer,
  });
  return file;
}

describe('Miniaturas das capas dos EPUBs selecionados', () => {
  it('extrai somente a capa JPEG declarada ou reconhecida no EPUB', async () => {
    const bytes = await buildKindleIssueEpub();
    const file = fixtureFile(bytes);
    const preview = await getEpubCoverThumbnail(file);
    expect(preview).toMatch(/^data:image\/jpeg;base64,/u);
    expect(await getEpubCoverThumbnail(file)).toBe(preview);
  });

  it('respeita o fallback quando o EPUB não possui capa ou está inválido', async () => {
    const zip = new JSZip();
    zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
    zip.file('META-INF/container.xml',
      '<container><rootfiles><rootfile full-path="OPS/book.opf" /></rootfiles></container>');
    zip.file('OPS/book.opf',
      '<package version="3.0"><metadata/><manifest/>' +
      '<spine/></package>');
    const emptyCoverBytes = await zip.generateAsync({ type: 'uint8array' });
    expect(await getEpubCoverThumbnail(fixtureFile(emptyCoverBytes, 'sem-capa.epub')))
      .toBeUndefined();
    expect(await getEpubCoverThumbnail(fixtureFile(new TextEncoder().encode('não é ZIP'),
      'invalido.epub'))).toBeUndefined();
  });

  it('mostra a capa detectada no cartão do arquivo individual', async () => {
    const bytes = await buildKindleIssueEpub();
    const file = fixtureFile(bytes);
    const state = createInitialState();
    state.payload = { file, bytes };
    const report = buildValidationReport({
      fileName: file.name, fileSize: bytes.length,
      validZip: true, issues: [], zipEntries: [],
    });
    report.cover = {
      declared: true, exists: true, source: 'opf-meta',
      previewDataUrl: 'data:image/jpeg;base64,' +
        Buffer.from(BASELINE_JPEG_BYTES).toString('base64'),
    };
    state.report = report;
    const panel = renderUploader(state, () => {});
    const icon = panel.querySelector('.upload-studio-file-symbol');
    expect(icon?.textContent).toContain('EPUB');
    expect(icon?.querySelector('img.epub-file-cover-image')?.getAttribute('src'))
      .toBe(report.cover.previewDataUrl);
    expect(panel.querySelector('.upload-studio-file-name')?.textContent).toBe(file.name);
  });

  it('carrega miniaturas por livro na lista do lote sem iniciar o processamento', async () => {
    const bytes = await buildKindleIssueEpub();
    const file = fixtureFile(bytes);
    const state = createInitialState();
    openBatchWithFiles(state, [file]);
    const panel = renderBatchWorkspace(state, () => {}, () => {}, () => {});
    document.body.append(panel);
    expect(panel.querySelector('.batch-studio-file-number')?.textContent).toContain('01');
    const preview = await getEpubCoverThumbnail(file);
    await Promise.resolve();
    const img = panel.querySelector<HTMLImageElement>(
      '.batch-studio-file-number img.epub-file-cover-image');
    expect(img?.getAttribute('src')).toBe(preview);
    expect(panel.querySelector('.batch-studio-file-meta strong')?.textContent).toBe(file.name);
    panel.remove();
  });
});
