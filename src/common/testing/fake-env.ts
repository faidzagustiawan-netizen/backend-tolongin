/**
 * Environment palsu untuk uji yang perlu membangun graf modul aplikasi.
 *
 * Beberapa service sengaja tidak punya nilai cadangan dan melempar galat di
 * constructor bila variabelnya kosong — `PaymentsService` (kunci Midtrans
 * dipakai memverifikasi tanda tangan webhook), `StorageService` (kredensial
 * bucket), dan `deriveKey` di `utils/encryption.util.ts` (kunci enkripsi
 * dokumen identitas, minimal 32 karakter). Keputusan itu benar, dan
 * konsekuensinya: graf ini tidak bisa dibangun tanpa environment yang lengkap.
 *
 * Daftar di bawah karena itu sekaligus menjadi dokumentasi environment minimum
 * untuk menyalakan API. Bila ada service baru yang menuntut variabel lain, uji
 * yang memakainya gagal sampai variabelnya ditambahkan di sini.
 *
 * Nilai-nilainya juga menggantikan isi `.env` sungguhan, yang di repositori ini
 * menunjuk basis data dan bucket produksi. Tidak ada koneksi yang dibuka:
 * pemanggilnya berhenti di `compile()`, yang tidak menjalankan `onModuleInit`.
 *
 * Berkas ini dikecualikan dari `tsconfig.build.json` — hanya dipakai uji.
 */
export const FAKE_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://tidak-dipakai@127.0.0.1:1/tidak-dipakai',
  JWT_SECRET: 'jwt-secret-khusus-uji',
  APP_SECRET: 'app-secret-khusus-uji-panjang-32-karakter-lebih',
  MIDTRANS_SERVER_KEY: 'midtrans-server-key-khusus-uji',
  MIDTRANS_CLIENT_KEY: 'midtrans-client-key-khusus-uji',
  STORAGE_ENDPOINT: 'http://127.0.0.1:1',
  STORAGE_ACCESS_KEY: 'storage-access-key-khusus-uji',
  STORAGE_SECRET_KEY: 'storage-secret-key-khusus-uji',
  STORAGE_BUCKET_NAME: 'bucket-khusus-uji',
  STORAGE_PUBLIC_URL: 'http://127.0.0.1:1/bucket-khusus-uji',
};

/** Terapkan `FAKE_ENV` ke `process.env`, menimpa nilai yang sudah ada. */
export function terapkanFakeEnv(): void {
  for (const [key, value] of Object.entries(FAKE_ENV)) {
    process.env[key] = value;
  }
}
