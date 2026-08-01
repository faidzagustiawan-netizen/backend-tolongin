-- Takedown moderasi berhenti menghapus baris.
--
-- `AdminService.takedownChallenge` memanggil `prisma.challenge.delete`. Rantai
-- cascade dari `challenges` berujung di `submissions`, dan `portfolios` ikut
-- cascade dari sana: satu klik takedown menghapus permanen seluruh hasil kerja
-- dan portofolio terverifikasi setiap talenta yang pernah ikut studi kasus itu.
-- Hukuman untuk perusahaan yang melanggar tidak boleh jatuh ke kandidatnya.
--
-- Tiga kolom ini menggantikan penghapusan: studi kasus ditutup dan ditandai,
-- bukan dibuang. Hanya admin yang bisa mencabut tandanya kembali.

ALTER TABLE "challenges" ADD COLUMN "takenDownAt" TIMESTAMP(3);
ALTER TABLE "challenges" ADD COLUMN "takenDownById" TEXT;
ALTER TABLE "challenges" ADD COLUMN "takedownReason" TEXT;
