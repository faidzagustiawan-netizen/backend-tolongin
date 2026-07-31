-- Menghapus mode pengerjaan tahap (`stageType`).
--
-- Hanya satu dari dua nilainya yang pernah hidup. Runner kandidat
-- (`workspace/[enrollmentId]/session`) tidak pernah membaca kolom ini sama
-- sekali: setiap tahap selalu disajikan satu-soal-per-layar. Nilai ASSIGNMENT
-- hanya berpengaruh di layar pratinjau penyusun, jadi pratinjau menjanjikan
-- tampilan yang tidak pernah dialami kandidat.
--
-- Kolomnya dibuang seluruhnya, bukan disempitkan jadi satu nilai, karena tidak
-- ada satu pun pembacaan yang tersisa di backend maupun frontend.

ALTER TABLE "challenge_sections" DROP COLUMN "stageType";

DROP TYPE "SectionStageType";
