// @vitest-environment jsdom
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildKindleIssueEpub } from './helpers/syntheticEpub';
import { loadEpub } from '../src/epub/reader/loadEpub';
import { validateZipAndOcf } from '../src/epub/validation/validateZip';

const fontPath = 'OEBPS/Fonts/TypeA.otf';
function encryption(algorithm: string, uri = fontPath): string {
  return '<?xml version="1.0" encoding="utf-8"?>' +
    '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" ' +
    'xmlns:enc="http://www.w3.org/2001/04/xmlenc#">' +
    '<enc:EncryptedData><enc:EncryptionMethod Algorithm="' + algorithm + '"/>' +
    '<enc:CipherData><enc:CipherReference URI="' + uri + '"/>' +
    '</enc:CipherData></enc:EncryptedData></encryption>';
}
async function fixture(markup: string) {
  const zip = await JSZip.loadAsync(await buildKindleIssueEpub());
  zip.file('META-INF/encryption.xml', markup);
  zip.file(fontPath, Uint8Array.from([0x41, 0x42, 0x43, 0x44]));
  return loadEpub('fonte-ofuscada.epub',
    await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}
describe('E-046: ofuscação de fontes legítimas não equivale a DRM', () => {
  it('reconhece somente o algoritmo IDPF apontando para uma fonte existente', async () => {
    const loaded = await fixture(encryption('http://www.idpf.org/2008/embedding'));
    const issues = validateZipAndOcf(loaded);
    expect(issues.map((issue) => issue.code)).toContain('FONT_OBFUSCATION');
    expect(issues.map((issue) => issue.code)).not.toContain('DRM_OR_ENCRYPTION');
    expect(issues.find((issue) => issue.code === 'FONT_OBFUSCATION')?.severity).toBe('info');
  });
  it('não reclassifica criptografia AES ou URI suspeita como fonte passiva', async () => {
    const encrypted = await fixture(encryption('http://www.w3.org/2001/04/xmlenc#aes128-cbc'));
    expect(validateZipAndOcf(encrypted).map((issue) => issue.code))
      .toContain('DRM_OR_ENCRYPTION');
    const wrong = await fixture(encryption('http://www.idpf.org/2008/embedding', 'missing.otf'));
    expect(validateZipAndOcf(wrong).map((issue) => issue.code))
      .toContain('DRM_OR_ENCRYPTION');
  });
});
