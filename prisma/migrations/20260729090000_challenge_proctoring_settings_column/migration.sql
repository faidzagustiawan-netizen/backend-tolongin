-- Pengaturan pengawasan ujian dipindahkan keluar dari `gradingRubric`.
--
-- Sebelumnya keduanya berbagi satu kolom JSON, jadi setiap tempat yang
-- menjumlahkan bobot kriteria harus ingat menyaring kunci `proctoringSettings`
-- (juga `customOutputs`, `durationHours`, `requireProctoring`) lebih dulu.
-- Satu pembaca yang lupa akan menghasilkan total bobot yang salah.
--
-- Data lama dipindahkan, bukan dibuang: nilai yang ada disalin ke kolom baru
-- lalu kuncinya dihapus dari rubrik.

ALTER TABLE "challenges" ADD COLUMN "proctoringSettings" JSONB;

UPDATE "challenges"
SET "proctoringSettings" = "gradingRubric" -> 'proctoringSettings',
    "gradingRubric"      = "gradingRubric" - 'proctoringSettings'
WHERE jsonb_typeof("gradingRubric") = 'object'
  AND "gradingRubric" ? 'proctoringSettings';
