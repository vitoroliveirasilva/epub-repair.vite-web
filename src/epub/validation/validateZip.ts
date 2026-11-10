import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import { EPUB_MIME, SYSTEM_FILE_PATTERNS } from '../utils/constants';
import { createIssue } from '../utils/issueFactory';
import { resolveReference } from '../utils/pathUtils';
import { findByLocalName, parseXml } from '../utils/xmlUtils';

export function validateZipAndOcf(loaded: LoadedEpub): Issue[] {
  const issues: Issue[] = [];
  const mimetype = loaded.files.get('mimetype');

  if (mimetype) {
    const value = new TextDecoder('utf-8', { fatal: false }).decode(mimetype.bytes);
    if (value !== EPUB_MIME) {
      issues.push(
        createIssue({
          code: 'MIME_INVALID_CONTENT',
          severity: 'error',
          title: 'Conteúdo do mimetype inválido',
          detail: `Esperado exatamente "${EPUB_MIME}", sem espaço, quebra de linha ou BOM.`,
          file: 'mimetype',
          context: `Valor atual: ${JSON.stringify(value)}`,
          repairable: true,
        }),
      );
    }
  }

  for (const name of loaded.fileNames) {
    if (SYSTEM_FILE_PATTERNS.some((pattern) => pattern.test(name))) {
      issues.push(
        createIssue({
          code: 'SYSTEM_FILE',
          severity: 'info',
          title: 'Arquivo de sistema desnecessário',
          detail: 'Esse arquivo não faz parte do livro e será removido no reparo.',
          file: name,
          repairable: true,
        }),
      );
    }
  }

  for (const sensitiveFile of [
    'META-INF/rights.xml',
    'META-INF/encryption.xml',
    'META-INF/signatures.xml',
  ]) {
    if (!loaded.files.has(sensitiveFile)) continue;
    const isEncryption = sensitiveFile.endsWith('encryption.xml');
    const onlyFontObfuscation = isEncryption && containsOnlyIdpfFontObfuscation(loaded);
    issues.push(createIssue({
      code: onlyFontObfuscation
        ? 'FONT_OBFUSCATION'
        : isEncryption ? 'DRM_OR_ENCRYPTION' : 'KINDLE_COMPATIBILITY',
      severity: isEncryption && !onlyFontObfuscation ? 'warning' : 'info',
      title: onlyFontObfuscation
        ? 'Fontes legalmente ofuscadas conforme padrão EPUB'
        : isEncryption ? 'Criptografia ou proteção de recursos detectada'
          : 'Metadado avançado encontrado',
      detail: onlyFontObfuscation
        ? 'Os recursos listados utilizam apenas a ofuscação de fontes IDPF. ' +
          'Isso não é, por si só, DRM. Nenhum recurso foi alterado.'
        : isEncryption
          ? 'A lista contém algoritmo desconhecido, recurso não-font, metadados inválidos ' +
            'ou criptografia real. O app não remove DRM nem descriptografa conteúdo.'
          : 'Assinaturas/direitos podem ser legítimos e não são removidos automaticamente.',
      file: sensitiveFile,
      repairable: false,
    }));
  }

  return issues;
}




function containsOnlyIdpfFontObfuscation(loaded: LoadedEpub): boolean {
  const entry = loaded.files.get('META-INF/encryption.xml');
  if (!entry) return false;
  try {
    const markup = new TextDecoder('utf-8', { fatal: true }).decode(entry.bytes);
    const doc = parseXml(markup);
    const resources = findByLocalName(doc, 'EncryptedData');
    if (resources.length === 0) return false;
    return resources.every((resource) => {
      const methods = findByLocalName(resource, 'EncryptionMethod');
      const targets = findByLocalName(resource, 'CipherReference');
      if (methods.length !== 1 || targets.length !== 1) return false;
      if (methods[0]?.getAttribute('Algorithm') !== 'http://www.idpf.org/2008/embedding') {
        return false;
      }
      const uri = targets[0]?.getAttribute('URI') ?? '';
      const target = resolveReference('', uri);
      return target.safe && /\.(?:otf|ttf|woff2?)$/iu.test(target.path) &&
        loaded.files.has(target.path);
    });
  } catch {
    return false;
  }
}
