/**
 * Saklar penegakan batas paket langganan.
 *
 * Batas kuota studi kasus dan penguncian fitur AI per paket sengaja dimatikan
 * selama pengembangan agar setiap fitur bisa dicoba tanpa perlu melewati
 * pembayaran Midtrans lebih dulu. Sebelumnya keadaan itu dicapai dengan
 * mengomentari badan `if`-nya satu per satu — tersebar di lima tempat,
 * menyisakan cabang kosong yang tidak melakukan apa pun, dan menuntut orang
 * berikutnya menemukan semuanya kembali saat hendak menyalakan lagi.
 *
 * Aturannya kini utuh di dalam kode dan hanya digerbang nilai ini. Untuk
 * menegakkannya kembali, setel `ENFORCE_SUBSCRIPTION_LIMITS=true` di environment
 * — tidak ada baris kode yang perlu disentuh.
 *
 * Dibaca per pemanggilan, bukan sekali saat modul dimuat, supaya pengujian bisa
 * menyalakan dan mematikannya per kasus.
 */
export function subscriptionLimitsEnforced(): boolean {
  return process.env.ENFORCE_SUBSCRIPTION_LIMITS === 'true';
}

/**
 * Saklar pendaftaran `SeedModule` — lapisan kedua di depan endpoint seeding.
 *
 * Hal pertama yang dikerjakan `POST /api/v1/seed` adalah
 * `TRUNCATE TABLE "users" CASCADE` beserta `"badges"` dan `"challenges"`.
 * Lapisan pertamanya adalah `@UseGuards(JwtAuthGuard, RolesGuard)` dengan
 * `@Roles(Role.ADMIN)` di `SeedController`.
 *
 * Saklar ini sengaja DIPERTAHANKAN sesudah guard itu dipasang, dan bukan karena
 * lupa dibersihkan. Guard bergantung pada rantai yang bisa keliru: satu akun
 * ADMIN yang bocor, satu salah penetapan peran, atau satu dekorator yang hilang
 * saat refactor sudah cukup untuk mengosongkan tabel produksi. Konsekuensi
 * kegagalannya tidak setara dengan biaya menahan satu modul tetap tidak
 * terdaftar, jadi keduanya dipakai bersama.
 *
 * Bila seeding memang dibutuhkan pada mesin produksi — misalnya menyegarkan data
 * demo — setel `ENABLE_SEED_ENDPOINT=true` di environment mesin itu. Yang
 * dibuka hanyalah lapisan kedua; permintaannya tetap wajib membawa token ADMIN.
 *
 * Berbeda dari `subscriptionLimitsEnforced`, nilainya dibaca sekali saat modul
 * dimuat, bukan per pemanggilan — daftar `imports` sebuah dekorator `@Module`
 * dievaluasi satu kali pada waktu boot.
 */
export function seedModuleEnabled(): boolean {
  if (process.env.ENABLE_SEED_ENDPOINT === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}
