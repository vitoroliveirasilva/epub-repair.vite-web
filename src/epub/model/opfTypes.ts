export interface PackageMetadata {
  title?: string | undefined;
  language?: string | undefined;
  identifier?: string | undefined;
  modified?: string | undefined;
}

export interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string[];
  fallback?: string | undefined;
  resolvedPath: string;
  exists: boolean;
}

export interface SpineItem {
  idref: string;
  linear?: string | undefined;
  manifestItem?: ManifestItem | undefined;
}

export interface PackageDocumentInfo {
  opfPath: string;
  opfDir: string;
  version: string;
  metadata: PackageMetadata;
  manifest: ManifestItem[];
  spine: SpineItem[];
  navItem?: ManifestItem | undefined;
  ncxItem?: ManifestItem | undefined;
  coverItem?: ManifestItem | undefined;
  rootfileCount: number;
}
