import type { BookMetadata } from './bookTools';

export function metadataChanges(
  original: BookMetadata, draft: BookMetadata,
): Partial<BookMetadata> {
  const changes: Partial<BookMetadata> = {};
  const keys = Object.keys(original) as Array<keyof BookMetadata>;
  for (const key of keys) {
    const value = draft[key].trim();
    if (!value || value === original[key].trim()) continue;
    changes[key] = value;
  }
  return changes;
}

export function metadataChangeCount(original: BookMetadata, draft: BookMetadata): number {
  return Object.keys(metadataChanges(original, draft)).length;
}
