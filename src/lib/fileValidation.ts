/**
 * Shared file validation helpers for registration / form uploads.
 *
 * Validation tolerates:
 *  - uppercase extensions (.JPG, .PNG, .JPEG)
 *  - browser MIME quirks (empty string, image/pjpeg, image/jpg)
 *  - config entries expressed as either MIME types ("image/jpeg")
 *    or as extensions (".jpg") — both shapes are accepted.
 *
 * It still enforces both an extension AND a MIME check (when MIME is
 * present) so unsafe/executable files cannot slip through.
 */

export const DEFAULT_ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
export const DEFAULT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

// MIME aliases the browser sometimes reports; map them to canonical MIME.
const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
};

const EXT_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
};

const MIME_TO_EXTS: Record<string, string[]> = Object.entries(EXT_TO_MIME).reduce(
  (acc, [ext, mime]) => {
    acc[mime] = acc[mime] ? [...acc[mime], ext] : [ext];
    return acc;
  },
  {} as Record<string, string[]>,
);

export function getFileExtension(fileName: string): string {
  if (!fileName) return '';
  const lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.slice(lastDot).toLowerCase() : '';
}

export function normalizeMime(mime: string | undefined | null): string {
  const m = (mime || '').toLowerCase().trim();
  return MIME_ALIASES[m] || m;
}

/**
 * Given a list of "types" that may be either MIME types (image/jpeg)
 * or file extensions (.jpg), produce a normalized
 * { extensions, mimes } pair.
 */
export function splitAllowedTypes(allowed: string[] | undefined): {
  extensions: string[];
  mimes: string[];
} {
  const extensions = new Set<string>();
  const mimes = new Set<string>();

  for (const raw of allowed || []) {
    if (!raw) continue;
    const v = raw.toLowerCase().trim();
    if (v.startsWith('.')) {
      extensions.add(v);
      const m = EXT_TO_MIME[v];
      if (m) mimes.add(m);
    } else if (v.includes('/')) {
      const canonical = normalizeMime(v);
      mimes.add(canonical);
      for (const e of MIME_TO_EXTS[canonical] || []) extensions.add(e);
    } else {
      // bare token like "jpg" -> treat as extension
      const ext = `.${v}`;
      extensions.add(ext);
      const m = EXT_TO_MIME[ext];
      if (m) mimes.add(m);
    }
  }

  return { extensions: [...extensions], mimes: [...mimes] };
}

export interface FileValidationOptions {
  allowedTypes?: string[]; // mixed MIME and/or extension list
  allowedExtensions?: string[];
  allowedMimeTypes?: string[];
  maxSizeBytes?: number;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  allowedExtensions: string[];
  allowedMimeTypes: string[];
}

export function isAllowedFile(
  file: File,
  options: FileValidationOptions = {},
): FileValidationResult {
  const fromMixed = splitAllowedTypes(options.allowedTypes);

  const allowedExtensions = (
    options.allowedExtensions?.length
      ? options.allowedExtensions
      : fromMixed.extensions.length
        ? fromMixed.extensions
        : DEFAULT_ALLOWED_EXTENSIONS
  ).map(e => e.toLowerCase());

  const allowedMimeTypes = (
    options.allowedMimeTypes?.length
      ? options.allowedMimeTypes
      : fromMixed.mimes.length
        ? fromMixed.mimes
        : DEFAULT_ALLOWED_MIME_TYPES
  ).map(m => m.toLowerCase());

  if (options.maxSizeBytes != null && file.size > options.maxSizeBytes) {
    return {
      valid: false,
      error: `File too large. Maximum size: ${(options.maxSizeBytes / (1024 * 1024)).toFixed(0)}MB`,
      allowedExtensions,
      allowedMimeTypes,
    };
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: 'File is empty',
      allowedExtensions,
      allowedMimeTypes,
    };
  }

  const ext = getFileExtension(file.name);
  const mime = normalizeMime(file.type);

  const extensionAllowed = !!ext && allowedExtensions.includes(ext);
  // If MIME is empty/unknown, fall back to extension (browser quirk tolerance).
  const mimeAllowed = !mime || allowedMimeTypes.includes(mime);

  if (!extensionAllowed || !mimeAllowed) {
    return {
      valid: false,
      error: `Invalid file type. Allowed: ${allowedExtensions.join(', ')}`,
      allowedExtensions,
      allowedMimeTypes,
    };
  }

  return { valid: true, allowedExtensions, allowedMimeTypes };
}
