// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { createInitialState } from '../src/app/state';
import { analyzeCurrentFile, applyCoverReplacementToCurrentFile,
  repairCurrentFile } from '../src/app/actions';
import { inspectEpub } from '../src/epub/validation/validateEpub';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';

const png = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYk0AAAAASUVORK5CYII=', 'base64'));

describe('E-113: nunca perder reparo anterior ao trocar capa ou revalidar', () => {
  it('usa cópia corrigida como base de nova capa, preservando a origem e o download', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    try {
      const original = await buildKindleIssueEpub();
      const state = createInitialState();
      state.payload = {
        file: { name:'original.epub' } as File, bytes: original,
      };
      state.originalSource = {fileName:'original.epub', bytes:original};
      state.report = await inspectEpub('original.epub',original);
      await repairCurrentFile(state);
      expect(state.repairResult?.changed).toBe(true);
      expect(state.payload?.bytes).not.toBe(original);
      const afterRepair = await JSZip.loadAsync(state.payload.bytes);
      const repairedOpf = await afterRepair.file('OEBPS/content.opf')!.async('string');
      expect(repairedOpf).toContain('version="2.0"');
      const firstName = state.payload.file.name;
      expect(firstName).toBe(state.repairResult?.fileName);
      state.coverImage = {
        fileName:'nova.png',bytes:png,mediaType:'image/png',previewDataUrl:'',
      };
      // Apenas escolher uma capa não deve alterar a cópia atual.
      expect(state.repairResult?.fileName).toBe(firstName);
      await applyCoverReplacementToCurrentFile(state);
      expect(state.repairResult?.operation).toBe('cover-replacement');
      const afterCover = await JSZip.loadAsync(state.payload.bytes);
      const opf = await afterCover.file('OEBPS/content.opf')!.async('string');
      expect(opf).toContain('version="2.0"');
      expect(opf).toContain('image/png');
      expect(state.originalSource.bytes).toBe(original);
      const finalName = state.payload.file.name;
      await analyzeCurrentFile(state);
      expect(state.repairResult?.fileName).toBe(finalName);
      expect(state.repairResult?.blob).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
  }, 30000);
});
