export type Severity = 'fatal' | 'error' | 'warning' | 'info' | 'success';

export type IssueCode =
  | 'ZIP_INVALID'
  | 'ZIP_DUPLICATE_ENTRY'
  | 'ZIP_ENCRYPTED_ENTRY'
  | 'ZIP_UNSAFE_PATH'
  | 'ZIP_NAME_COLLISION'
  | 'MIME_MISSING'
  | 'MIME_NOT_FIRST'
  | 'MIME_COMPRESSED'
  | 'MIME_EXTRA_FIELD'
  | 'MIME_INVALID_CONTENT'
  | 'CONTAINER_MISSING'
  | 'CONTAINER_INVALID_XML'
  | 'CONTAINER_NO_ROOTFILE'
  | 'CONTAINER_MULTIPLE_ROOTFILES'
  | 'OPF_MISSING'
  | 'OPF_INVALID_XML'
  | 'OPF_METADATA_MISSING'
  | 'OPF_MANIFEST_EMPTY'
  | 'OPF_SPINE_EMPTY'
  | 'OPF_DUPLICATE_ID'
  | 'OPF_DUPLICATE_HREF'
  | 'OPF_BAD_MEDIA_TYPE'
  | 'OPF_MISSING_RESOURCE'
  | 'OPF_UNSAFE_HREF'
  | 'OPF_SPINE_BAD_IDREF'
  | 'OPF_COVER_MISSING'
  | 'OPF_LANGUAGE_INVALID'
  | 'OPF_DATE_INVALID_FORMAT'
  | 'OPF_PACKAGE_VERSION_OLD'
  | 'OPF_COVER_META_MISSING'
  | 'OPF_COVER_MANIFEST_MISMATCH'
  | 'NAV_MISSING'
  | 'NAV_INVALID'
  | 'NCX_MISSING'
  | 'NCX_INVALID'
  | 'NCX_PLAYORDER_DUPLICATE'
  | 'NCX_PLAYORDER_OUT_OF_ORDER'
  | 'NCX_SPINE_MISSING_ITEMS'
  | 'NCX_CONTENT_MISSING_RESOURCE'
  | 'CONTENT_INVALID_XML'
  | 'CONTENT_MISSING_RESOURCE'
  | 'CONTENT_REMOTE_RESOURCE'
  | 'CONTENT_SCRIPTED'
  | 'CONTENT_KINDLE_EMBED_BROKEN'
  | 'CONTENT_UNSAFE_EMBED'
  | 'XHTML_NBSP_ENTITY'
  | 'XHTML_LANG_MISSING'
  | 'XHTML_CONTENT_TYPE_SUSPICIOUS'
  | 'CSS_MISSING_RESOURCE'
  | 'CSS_REMOTE_RESOURCE'
  | 'IMAGE_PROGRESSIVE_JPEG'
  | 'ORPHAN_RESOURCE'
  | 'SYSTEM_FILE'
  | 'DRM_OR_ENCRYPTION'
  | 'KINDLE_COMPATIBILITY'
  | 'REPAIR_APPLIED'
  | 'REPAIR_SKIPPED';

export interface Issue {
  id: string;
  code: IssueCode;
  severity: Severity;
  title: string;
  detail: string;
  repairable: boolean;
  file?: string | undefined;
  context?: string | undefined;
}

export interface IssueInput {
  code: IssueCode;
  severity: Severity;
  title: string;
  detail: string;
  repairable: boolean;
  file?: string | undefined;
  context?: string | undefined;
}
