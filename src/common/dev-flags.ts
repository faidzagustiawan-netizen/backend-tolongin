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
