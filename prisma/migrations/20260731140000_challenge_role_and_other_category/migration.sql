-- Posisi yang direkrut, dan bidang di luar keenam yang tersedia.
--
-- `role` sudah lama ditanyakan di layar pembuka pembuatan challenge ("Posisi
-- atau peran yang dicari") tetapi hanya dipakai menyemai judul dan prompt AI,
-- lalu dibuang tanpa pernah tersimpan.
--
-- `OTHER` menutup jalan buntu bagi perusahaan yang merekrut di luar enam
-- kategori bank soal. Nilainya ditambahkan, tidak dipakai, di migrasi ini —
-- PostgreSQL melarang memakai nilai enum baru pada transaksi yang sama dengan
-- yang menambahkannya.

ALTER TABLE "challenges" ADD COLUMN "role" TEXT;

ALTER TYPE "ChallengeCategory" ADD VALUE 'OTHER';
