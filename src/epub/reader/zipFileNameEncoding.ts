/**
 * ZIP general-purpose bit 11 indica nomes UTF-8; arquivos antigos sem a flag
 * usam normalmente IBM CP437. Aceitar CP437 apenas quando os bytes não são
 * UTF-8 válido, evitando reinterpretar EPUBs legados UTF-8 sem flag.
 *
 * A decodificação também é fornecida ao JSZip: inspetor e extrator precisam
 * resolver cada nome exatamente da mesma maneira.
 */
const HIGH_CP437 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
const utf8 = new TextDecoder('utf-8', { fatal: true });

export function decodeZipFileName(bytes: Uint8Array, utf8Flag = false): string {
  try {
    return utf8.decode(bytes);
  } catch (error) {
    if (utf8Flag) throw error;
    let result = '';
    for (const byte of bytes) {
      result += byte < 128 ? String.fromCharCode(byte) : HIGH_CP437[byte - 128];
    }
    return result;
  }
}
