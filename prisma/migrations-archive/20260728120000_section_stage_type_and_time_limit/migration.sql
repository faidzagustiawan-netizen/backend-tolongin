-- Builder soal (QuestionBuilder) sudah mengirim `stageType` dan `timeLimit`
-- pada setiap section sejak awal, tetapi tidak ada kolomnya di sini. Karena
-- ValidationPipe global memakai forbidNonWhitelisted, seluruh permintaan
-- POST /challenges dari mode manual ditolak 400 sebelum menyentuh database.
--
-- Kolom ditambahkan aditif: `stageType` punya default sehingga baris lama
-- tetap sah, `timeLimit` nullable dengan arti "tak terbatas".

CREATE TYPE "SectionStageType" AS ENUM ('QUIZ', 'ASSIGNMENT');

ALTER TABLE "challenge_sections"
  ADD COLUMN "stageType" "SectionStageType" NOT NULL DEFAULT 'ASSIGNMENT',
  ADD COLUMN "timeLimit" INTEGER;
