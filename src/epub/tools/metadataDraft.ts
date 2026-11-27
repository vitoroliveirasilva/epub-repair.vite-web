import type { BookMetadata } from './bookTools';

export function metadataChanges(
  original: BookMetadata, draft: BookMetadata,
): Partial<BookMetadata> {
  const changes: Partial<BookMetadata> = {};
  const keys = Object.keys(original) as Array<keyof BookMetadata>;
  for (const key of keys) {
    const normalize = (value: string): string => key === 'additionalCreatorRoles'
      ? value.replace(/\r\n/gu, '\n').split('\n')
        .map((line) => line.trim()).join('\n')
      : value.trim();
    const value = normalize(draft[key]);
    if (!value.trim() || value === normalize(original[key])) continue;
    changes[key] = value;
  }
  return changes;
}

export function metadataChangeCount(original: BookMetadata, draft: BookMetadata): number {
  return Object.keys(metadataChanges(original, draft)).length;
}
