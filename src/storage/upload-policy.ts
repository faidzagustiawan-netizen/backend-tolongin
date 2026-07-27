/**
 * Kebijakan berkas yang boleh masuk ke bucket publik.
 *
 * Bucket ini disajikan lewat domain publik, jadi tipe yang bisa dieksekusi
 * peramban (text/html, image/svg+xml, application/xhtml+xml) sengaja tidak
 * dimasukkan: berkas semacam itu berubah menjadi XSS tersimpan begitu
 * tautannya dibuka orang lain.
 */
export const ALLOWED_MIME_TYPES = [
  // Gambar
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  // Dokumen
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'text/markdown',
  // Arsip solusi
  'application/zip',
  'application/x-zip-compressed',
  // Notebook & data
  'application/json',
  'application/x-ipynb+json',
  // Video jawaban
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export function isAllowedMimeType(mimeType?: string): boolean {
  if (!mimeType) return false;
  // Buang parameter seperti "; charset=utf-8" sebelum dicocokkan.
  const normalized = mimeType.split(';')[0].trim().toLowerCase();
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(normalized);
}
