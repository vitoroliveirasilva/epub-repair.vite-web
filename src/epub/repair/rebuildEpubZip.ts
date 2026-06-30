import JSZip from 'jszip';
import { EPUB_MIME } from '../utils/constants';

export async function rebuildEpubZip(files: Map<string, Uint8Array>): Promise<Blob> {
  const zip = new JSZip();
  zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });

  const names = Array.from(files.keys())
    .filter((path) => path !== 'mimetype')
    .sort((a, b) => a.localeCompare(b));

  for (const name of names) {
    zip.file(name, files.get(name)!, { compression: 'DEFLATE' });
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: EPUB_MIME,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
