import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import { createIssue } from '../utils/issueFactory';

const SUSPICIOUS_EXTENSION = /\.(?:exe|dll|com|bat|cmd|ps1|scr|msi|apk|jar|vbs|wasm|class)$/iu;
const EXTENSION_EXPECTATION: Record<string, string> = {
  '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.gif': 'gif', '.webp': 'webp',
  '.woff': 'woff', '.woff2': 'woff2', '.otf': 'otf', '.ttf': 'ttf',
};

function matches(bytes: Uint8Array, ...signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

 
export function sniffBinaryKind(bytes: Uint8Array): string | undefined {
  if (matches(bytes, 0x4d, 0x5a)) return 'pe-executable';
  if (matches(bytes, 0x7f, 0x45, 0x4c, 0x46)) return 'elf-executable';
  if (matches(bytes, 0x00, 0x61, 0x73, 0x6d)) return 'wasm-module';
  if (matches(bytes, 0xca, 0xfe, 0xba, 0xbe)) return 'java-class-or-fat-binary';
  if ([
    [0xfe, 0xed, 0xfa, 0xce], [0xce, 0xfa, 0xed, 0xfe],
    [0xfe, 0xed, 0xfa, 0xcf], [0xcf, 0xfa, 0xed, 0xfe],
  ].some((signature) => matches(bytes, ...signature))) return 'mach-o-executable';
  if (matches(bytes, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (matches(bytes, 0xff, 0xd8, 0xff)) return 'jpeg';
  if (matches(bytes, 0x47, 0x49, 0x46, 0x38)) return 'gif';
  if (matches(bytes, 0x52, 0x49, 0x46, 0x46) &&
      matches(bytes.subarray(8), 0x57, 0x45, 0x42, 0x50)) return 'webp';
  if (matches(bytes, 0x77, 0x4f, 0x46, 0x32)) return 'woff2';
  if (matches(bytes, 0x77, 0x4f, 0x46, 0x46)) return 'woff';
  if (matches(bytes, 0x4f, 0x54, 0x54, 0x4f)) return 'otf';
  if (matches(bytes, 0x00, 0x01, 0x00, 0x00)) return 'ttf';
  return undefined;
}





export function validateSuspiciousResources(loaded: LoadedEpub): Issue[] {
  const issues: Issue[] = [];
  for (const [path, entry] of loaded.files) {
    const bytes = entry.bytes;
    const kind = sniffBinaryKind(bytes);
    const isExecutable = Boolean(kind && (
      kind.includes('executable') || kind === 'wasm-module' || kind === 'java-class-or-fat-binary'));
    const suspiciousExtension = SUSPICIOUS_EXTENSION.test(path);

    if (suspiciousExtension || isExecutable) {
      issues.push(createIssue({
        code: 'PACKAGE_SUSPICIOUS_EXECUTABLE',
        severity: 'warning',
        title: 'Arquivo potencialmente executável no EPUB',
        detail: 'Extensão ou assinatura binária identificada (' +
          (kind ?? 'não identificada') + '). Isso não comprova malware; ' +
          'o arquivo exige revisão manual e não será removido automaticamente.',
        file: path,
        repairable: false,
      }));
      continue;
    }

    const extension = path.toLowerCase().match(/\.[a-z0-9]+$/u)?.[0] ?? '';
    const expected = EXTENSION_EXPECTATION[extension];
    
    
    if (expected && kind && kind !== expected) {
      issues.push(createIssue({
        code: 'PACKAGE_BINARY_SIGNATURE_MISMATCH',
        severity: 'warning',
        title: 'Extensão e assinatura binária não correspondem',
        detail: 'O recurso tem extensão ' + extension + ' mas assinatura reconhecida como ' +
          kind + '. Verifique se o arquivo foi nomeado corretamente.',
        file: path,
        repairable: false,
      }));
    }
  }
  return issues;
}
