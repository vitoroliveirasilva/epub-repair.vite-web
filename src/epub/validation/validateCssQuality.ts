import type { LoadedEpub } from '../model/epubTypes';
import type { Issue } from '../model/issueTypes';
import type { PackageDocumentInfo } from '../model/opfTypes';
import { createIssue } from '../utils/issueFactory';

/**
 * Diagnóstico apenas. Declarações CSS repetidas frequentemente são fallbacks
 * intencionais; não reescrever cascata sem verificar equivalência visual.
 */
export function validateCssQuality(loaded: LoadedEpub, pkg: PackageDocumentInfo): Issue[] {
  const issues: Issue[] = [];
  for (const item of pkg.manifest) {
    if (!item.exists || item.mediaType !== 'text/css') continue;
    const bytes = loaded.files.get(item.resolvedPath)?.bytes;
    if (!bytes) continue;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const duplicates = new Set<string>();
    const conflicts = new Set<string>();
    // Remover comentários antes de inspecionar seletores planos, sem modificar arquivo.
    const clean = text.replace(/\/\*[\s\S]*?\*\//gu, '');
    for (const match of clean.matchAll(/(?:^|[}])\s*([^{}]+)\{([^{}]*)\}/gmu)) {
      const selector = (match[1] ?? '').trim();
      if (!selector || selector.startsWith('@') || selector.includes('{')) continue;
      const seen = new Map<string, string>();
      for (const declaration of (match[2] ?? '').split(';')) {
        const position = declaration.indexOf(':');
        if (position < 1) continue;
        const property = declaration.slice(0, position).trim().toLowerCase();
        const value = declaration.slice(position + 1).trim().replace(/\s+/gu, ' ').toLowerCase();
        if (!/^(?:--[\w-]+|-?[\w-]+)$/u.test(property) || !value) continue;
        const previous = seen.get(property);
        if (previous !== undefined) {
          const key = selector.slice(0, 80) + ' (' + property + ')';
          if (previous === value) duplicates.add(key);
          else conflicts.add(key);
        }
        seen.set(property, value);
      }
    }
    if (duplicates.size > 0) {
      issues.push(createIssue({
        code: 'CSS_REDUNDANT_DECLARATION',
        severity: 'info',
        title: 'Declarações CSS repetidas na mesma regra',
        detail: 'Uma ou mais propriedades aparecem repetidas com valor idêntico. ' +
          'Não foram removidas automaticamente: a equivalência visual deve ser verificada.',
        file: item.resolvedPath,
        context: [...duplicates].slice(0, 5).join(', '),
        repairable: false,
      }));
    }
    if (conflicts.size > 0) {
      issues.push(createIssue({
        code: 'CSS_CONFLICTING_DECLARATION',
        severity: 'info',
        title: 'Declarações CSS potencialmente contraditórias',
        detail: 'A mesma propriedade recebe valores diferentes em uma regra. ' +
          'Pode ser fallback intencional; mantenha até revisão visual.',
        file: item.resolvedPath,
        context: [...conflicts].slice(0, 5).join(', '),
        repairable: false,
      }));
    }
  }
  return issues;
}
