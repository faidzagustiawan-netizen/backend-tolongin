-- Lencana berhenti mengukur satu hal saja.
--
-- `badges.requiredXp` adalah satu-satunya kriteria yang pernah ada, sehingga
-- ketiga lencana bawaan membaca angka yang sama pada ambang berbeda — dan
-- judulnya menjanjikan hal yang tidak pernah diukur ("Bug Hunter — Squashed
-- 100 bugs" sebenarnya berarti XP >= 300).
--
-- Kolom lamanya dipindahkan, bukan dibuang begitu saja: setiap baris yang ada
-- menjadi kriteria TOTAL_XP dengan ambang yang persis sama, jadi lencana yang
-- sudah dimiliki talenta tetap sah dan tidak ada yang perlu dicabut.

CREATE TYPE "BadgeCriteria" AS ENUM (
  'TOTAL_XP',
  'CHALLENGES_PASSED',
  'HIGH_SCORES',
  'DIFFICULTY_PASSED',
  'CATEGORY_BREADTH',
  'IDENTITY_VERIFIED',
  'PORTFOLIO_ENTRIES',
  'DISCUSSION_POSTS',
  'HIRED',
  'SKILLS_LISTED'
);

ALTER TABLE "badges"
  ADD COLUMN "criteria" "BadgeCriteria" NOT NULL DEFAULT 'TOTAL_XP',
  ADD COLUMN "threshold" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "param" TEXT;

-- Pindahkan nilai lama sebelum kolomnya dibuang.
UPDATE "badges" SET "threshold" = "requiredXp";

ALTER TABLE "badges" DROP COLUMN "requiredXp";
