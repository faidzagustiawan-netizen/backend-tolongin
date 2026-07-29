-- Soal psikometrik berskala Likert.
--
-- Tidak punya jawaban benar dan tidak menyumbang poin. Hasilnya diringkas
-- menjadi profil per dimensi, bukan satu angka benar-salah — memasukkannya ke
-- `aiScore` atau `finalScore` akan mengubah ukuran "seberapa benar" menjadi
-- campuran yang tidak bisa ditafsirkan.
ALTER TYPE "ComponentType" ADD VALUE 'PSYCHOMETRIC';

-- Bentuknya: { dimensions: [{ name, score, itemCount }], computedAt }
-- dengan skor 0-100 hasil normalisasi skala tiap soal.
ALTER TABLE "submissions" ADD COLUMN "psychometricProfile" JSONB;
