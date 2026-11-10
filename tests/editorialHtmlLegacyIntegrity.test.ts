
import { describe, expect, it } from 'vitest';
import { auditPreservation } from '../src/epub/repair/preservationAudit';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const enc = new TextEncoder();

function audit(beforeMarkup: string, afterMarkup: string, mediaType = 'text/html') {
  const path = mediaType === 'text/html' ? 'OPS/chapter.html' : 'OPS/chapter.xhtml';
  const entry = { id: 'chapter', resolvedPath: path, exists: true, mediaType };
  const pkg = {
    manifest: [entry],
    spine: [{ idref: 'chapter', manifestItem: entry }],
  } as unknown as PackageDocumentInfo;
  const loaded = { files: new Map([[path, { bytes: enc.encode(beforeMarkup) }]]) } as unknown as LoadedEpub;
  return () => auditPreservation(loaded,
    new Map([[path, enc.encode(afterMarkup)]]), pkg, pkg);
}

const htmlOpen = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>';
const htmlClose = '</body></html>';

describe('estabilidade editorial: HTML legado, recursos e falha fechada', () => {
  it('não confunde HTML com tags void com XML inválido e protege itálicos', () => {
    const before = htmlOpen + '<p>Leia <em>agora</em>.</p>' + htmlClose;
    const after = htmlOpen + '<p>Leia agora.</p>' + htmlClose;
    expect(audit(before, after)).toThrow(/formatação|ênfase/u);
  });

  it('protege remissões internas em HTML com meta e br sem fechamento XML', () => {
    const before = htmlOpen +
      '<p><a id="nota">Nota</a><br><a href="#nota">Voltar</a></p>' + htmlClose;
    const after = before.replace('href="#nota"', 'href="#sumiu"');
    expect(audit(before, after)).toThrow(/remissão interna/u);
  });

  it('autoriza HTML sem alteração e um acréscimo textual rastreável', () => {
    const before = htmlOpen + '<p>Primeiro parágrafo.</p>' + htmlClose;
    expect(audit(before, before)()).toEqual([]);
    const after = htmlOpen + '<p>Primeiro parágrafo. [Imagem ausente]</p>' + htmlClose;
    expect(audit(before, after)().some(note => /acréscimos/u.test(note))).toBe(true);
  });

  it('recusa perder arquivos HTML declarados que não estão no spine', () => {
    const path = 'OPS/appendix.html';
    const item = { id: 'appendix', resolvedPath: path, exists: true, mediaType: 'text/html' };
    const pkg = { manifest: [item], spine: [] } as unknown as PackageDocumentInfo;
    const loaded = { files: new Map([[path, { bytes: enc.encode('<p>Apêndice</p>') }]]) } as unknown as LoadedEpub;
    expect(() => auditPreservation(loaded, new Map(), pkg, pkg))
      .toThrow(/documento editorial declarado/u);
  });

  it('recusa perder imagens e fontes antes presentes no manifest', () => {
    for (const mime of ['image/png', 'font/woff2']) {
      const path = 'OPS/resource';
      const item = { id: 'res', resolvedPath: path, exists: true, mediaType: mime };
      const pkg = { manifest: [item], spine: [] } as unknown as PackageDocumentInfo;
      const loaded = { files: new Map([[path, { bytes: Uint8Array.of(1, 2) }]]) } as unknown as LoadedEpub;
      expect(() => auditPreservation(loaded, new Map(), pkg, pkg))
        .toThrow(/imagem ou fonte editorial/u);
    }
  });

  it('não libera XHTML modificado quando o texto não pode ser comparado', () => {
    const oldMarkup = '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Olá';
    const newMarkup = '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Olá</p></body></html>';
    expect(audit(oldMarkup, newMarkup, 'application/xhtml+xml'))
      .toThrow(/não pôde ser auditada/u);
  });

  it('recusa liberar um EPUB sem pacote editorial final verificável', () => {
    const path = 'OPS/chapter.html';
    const entry = { id: 'c', exists: true, resolvedPath: path, mediaType: 'text/html' };
    const pkg = { manifest: [entry], spine: [] } as unknown as PackageDocumentInfo;
    const loaded = { files: new Map([[path, { bytes: enc.encode('<p>Oi</p>') }]]) } as unknown as LoadedEpub;
    expect(() => auditPreservation(loaded, new Map([[path, enc.encode('<p>Oi</p>')]]),
      pkg, undefined)).toThrow(/estrutura editorial verificável/u);
  });
});
