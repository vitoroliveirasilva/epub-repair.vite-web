




export function decodeUtf8ForRewrite(bytes: Uint8Array, path: string): string {
  if (bytes.length >= 2 &&
    ((bytes[0] === 0xff && bytes[1] === 0xfe) ||
     (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    throw new Error('Codificação UTF-16 não suportada para regravação fiel: ' +
      path + '. O recurso original permanece intocado.');
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Bytes não UTF-8 em recurso textual: ' + path +
      '. O reparo automático foi bloqueado para não substituir caracteres.');
  }

  const prefix = text.slice(0, 512);
  const xmlEncoding = /^\s*<\?xml\b[^?]*?\bencoding\s*=\s*(["'])([^"']+)\1/iu.exec(prefix)?.[2];
  const cssEncoding = /^\s*@charset\s+(["'])([^"']+)\1\s*;/iu.exec(prefix)?.[2];
  const declared = (xmlEncoding || cssEncoding)?.trim();
  if (declared && !/^utf-?8$/iu.test(declared)) {
    throw new Error('Declaração de codificação não suportada (' + declared + ') em ' +
      path + '. Não é seguro reescrever o recurso sem converter seu charset.');
  }
  
  
  return text;
}
