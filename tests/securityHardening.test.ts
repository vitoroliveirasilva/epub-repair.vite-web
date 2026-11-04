import { describe, expect, it } from 'vitest';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { parseZipCentralDirectory } from '../src/epub/reader/rawZipInspector';
import { isRemoteUrl } from '../src/epub/utils/pathUtils';
import { sanitizeCssDocument } from '../src/epub/sanitize/sanitizeCss';
import { shouldRemoveUrl } from '../src/epub/sanitize/sanitizeActiveContent';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';

function firstCentralOffset(bytes: Uint8Array): number {
  for (let cursor = bytes.length - 22; cursor >= Math.max(0, bytes.length - 65557); cursor--) {
    if (new DataView(bytes.buffer, bytes.byteOffset).getUint32(cursor, true) === 0x06054b50) {
      return new DataView(bytes.buffer, bytes.byteOffset).getUint32(cursor + 16, true);
    }
  }
  throw new Error('Fixture sem diretório central');
}

describe('limites e validação defensiva ZIP', () => {
  it('continua aceitando EPUB válido', async () => {
    const raw = parseZipCentralDirectory(await buildKindleIssueEpub());
    expect(raw.issues.some((issue) => issue.severity === 'fatal')).toBe(false);
  });

  it('bloqueia ZIP com tamanho descompactado forjado antes de abrir entradas', async () => {
    const bytes = new Uint8Array(await buildKindleIssueEpub());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint32(firstCentralOffset(bytes) + 24, 0xfffffffe, true);
    const loaded = await loadEpub('malicioso.epub', bytes);
    expect(loaded.validZip).toBe(false);
    expect(loaded.files.size).toBe(0);
    expect(loaded.issues.some((issue) => issue.code === 'ZIP_RESOURCE_LIMIT')).toBe(true);
  });

  it('bloqueia contagem excessiva e offsets inválidos', async () => {
    const original = await buildKindleIssueEpub();
    const eocd = original.length - 22;

    const tooMany = new Uint8Array(original);
    new DataView(tooMany.buffer).setUint16(eocd + 10, 10001, true);
    expect(parseZipCentralDirectory(tooMany).issues.some((i) => i.severity === 'fatal')).toBe(true);

    const badOffset = new Uint8Array(original);
    new DataView(badOffset.buffer).setUint32(eocd + 16, 0xfffffffe, true);
    expect(parseZipCentralDirectory(badOffset).issues.some((i) => i.severity === 'fatal')).toBe(true);
  });
});

describe('políticas de URLs e recursos externos', () => {
  it('detecta protocols incomuns e URLs protocol-relative', () => {
    expect(isRemoteUrl('vbscript:msgbox(1)')).toBe(true);
    expect(isRemoteUrl('//cdn.example/asset')).toBe(true);
    expect(isRemoteUrl('java\nscript:alert(1)')).toBe(true);
    expect(isRemoteUrl('../Images/cover.jpg')).toBe(false);
  });

  it('neutraliza schemes ativos mesmo com links remotos permitidos', () => {
    expect(shouldRemoveUrl('java\nscript:alert(1)', {
      sanitizeScripts: true,
      removeRemoteResourceLinks: false,
    })).toBe(true);
    expect(shouldRemoveUrl('https://example.org', {
      sanitizeScripts: true,
      removeRemoteResourceLinks: false,
    })).toBe(false);
    expect(shouldRemoveUrl('https://example.org', {
      sanitizeScripts: true,
      removeRemoteResourceLinks: true,
    })).toBe(true);
  });

  it('neutraliza import sem aspas e CSS com escapes no protocolo', () => {
    const result = sanitizeCssDocument(
      'OEBPS/style.css',
      '@import url(https://cdn.example/a.css); .x { background: url(j\\61vascript:alert(1)) }',
      new Set(['OEBPS/style.css']),
    );
    expect(result.text).not.toContain('@import');
    expect(result.text).toContain('none');
  });
});
