import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import { EPUB_MIME, SYSTEM_FILE_PATTERNS } from '../utils/constants';
import { createIssue } from '../utils/issueFactory';

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
    issues.push(
      createIssue({
        code: sensitiveFile.endsWith('encryption.xml')
          ? 'DRM_OR_ENCRYPTION'
          : 'KINDLE_COMPATIBILITY',
        severity: sensitiveFile.endsWith('encryption.xml') ? 'warning' : 'info',
        title: sensitiveFile.endsWith('encryption.xml')
          ? 'Arquivo de criptografia encontrado'
          : 'Metadado avançado encontrado',
        detail: sensitiveFile.endsWith('encryption.xml')
          ? 'Pode indicar fontes ofuscadas, recursos criptografados ou DRM. O app não remove DRM nem descriptografa conteúdo.'
          : 'Assinaturas/direitos podem ser legítimos, mas às vezes geram incompatibilidade em ingestões mais rígidas.',
        file: sensitiveFile,
        repairable: false,
      }),
    );
  }

  return issues;
}
