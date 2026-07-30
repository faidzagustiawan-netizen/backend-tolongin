-- Tahapan yang bisa diatur: jendela waktu per tahap, batas waktu yang benar-
-- benar ditegakkan, dan syarat masuk berbasis nilai.
--
-- Sebelum ini `challenge_sections.timeLimit` sudah tersimpan tetapi tidak ada
-- yang menegakkannya — tidak ada tempat mencatat kapan seorang kandidat mulai,
-- jadi tidak ada pula batas yang bisa dilewati. Dan penilaian hanya mengenal
-- satu baris `submissions` untuk seluruh challenge, sehingga tidak ada angka
-- per tahap yang bisa dibandingkan dengan ambang lolos.
--
-- Seluruh kolom baru punya default atau nullable, jadi studi kasus yang sudah
-- ada berperilaku persis seperti sebelumnya: `gateMode = OPEN` di mana-mana.

CREATE TYPE "StageGateMode" AS ENUM ('OPEN', 'MIN_SCORE', 'TOP_N', 'MANUAL_APPROVAL');
CREATE TYPE "GateScoreBasis" AS ENUM ('PREVIOUS_STAGE', 'CUMULATIVE', 'SPECIFIC_STAGES');
CREATE TYPE "StagePendingPolicy" AS ENUM ('WAIT_FOR_SCORE', 'AUTO_ADVANCE_AFTER', 'MANUAL_ONLY');
CREATE TYPE "StageAttemptStatus" AS ENUM (
  'LOCKED',
  'IN_PROGRESS',
  'SUBMITTED',
  'AWAITING_GRADE',
  'PASSED',
  'FAILED',
  'EXPIRED'
);

ALTER TABLE "challenge_sections"
  ADD COLUMN "opensAt" TIMESTAMP(3),
  ADD COLUMN "closesAt" TIMESTAMP(3),
  ADD COLUMN "gateMode" "StageGateMode" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "minScore" DOUBLE PRECISION,
  ADD COLUMN "maxAdvancing" INTEGER,
  ADD COLUMN "scoreBasis" "GateScoreBasis" NOT NULL DEFAULT 'PREVIOUS_STAGE',
  ADD COLUMN "gateSourceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "pendingPolicy" "StagePendingPolicy" NOT NULL DEFAULT 'WAIT_FOR_SCORE',
  ADD COLUMN "graceDays" INTEGER;

CREATE TABLE "stage_attempts" (
  "id" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "status" "StageAttemptStatus" NOT NULL DEFAULT 'LOCKED',
  "startedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "score" DOUBLE PRECISION,
  "gradedAt" TIMESTAMP(3),
  "unlockedAt" TIMESTAMP(3),
  "lockReason" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "stage_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stage_attempts_enrollmentId_sectionId_key"
  ON "stage_attempts"("enrollmentId", "sectionId");

-- Cron kadaluarsa menyaring status lalu membandingkan expiresAt tiap menit.
CREATE INDEX "stage_attempts_status_expiresAt_idx"
  ON "stage_attempts"("status", "expiresAt");

-- Peringkat TOP_N mengurutkan nilai di dalam satu tahap.
CREATE INDEX "stage_attempts_sectionId_score_idx"
  ON "stage_attempts"("sectionId", "score" DESC);

ALTER TABLE "stage_attempts"
  ADD CONSTRAINT "stage_attempts_enrollmentId_fkey"
    FOREIGN KEY ("enrollmentId") REFERENCES "challenge_enrollments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "stage_attempts_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "challenge_sections"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Submisi kini bisa mewakili satu tahap, bukan selalu seluruh challenge.
-- Keduanya nullable: baris yang sudah ada mewakili seluruh challenge dan tetap
-- sah apa adanya.
ALTER TABLE "submissions"
  ADD COLUMN "sectionId" TEXT,
  ADD COLUMN "stageAttemptId" TEXT;

CREATE UNIQUE INDEX "submissions_stageAttemptId_key"
  ON "submissions"("stageAttemptId");
CREATE INDEX "submissions_sectionId_idx" ON "submissions"("sectionId");

ALTER TABLE "submissions"
  ADD CONSTRAINT "submissions_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "challenge_sections"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "submissions_stageAttemptId_fkey"
    FOREIGN KEY ("stageAttemptId") REFERENCES "stage_attempts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill pendaftaran yang sedang berjalan.
--
-- Tanpa ini kandidat yang sudah masuk ruang kerja akan melihat seluruh tahap
-- terkunci begitu kode baru terpasang: tidak ada satu pun baris attempt, dan
-- yang tidak ada dianggap belum terbuka.
--
-- Karena semua tahap yang sudah ada bergerbang OPEN, statusnya cukup dibedakan
-- antara tahap yang sedang dikerjakan (tahap pertama) dan sisanya. Yang sudah
-- SUBMITTED atau EVALUATED tidak diberi attempt — pengerjaannya sudah selesai
-- di bawah aturan lama dan tidak perlu dibongkar ulang.
INSERT INTO "stage_attempts" ("id", "enrollmentId", "sectionId", "status", "startedAt", "unlockedAt", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::TEXT,
  e."id",
  s."id",
  CASE WHEN s."order" = first_stage."minOrder" THEN 'IN_PROGRESS'::"StageAttemptStatus"
       ELSE 'LOCKED'::"StageAttemptStatus" END,
  CASE WHEN s."order" = first_stage."minOrder" THEN e."startedAt" ELSE NULL END,
  -- Hanya tahap pertama yang benar-benar sudah terbuka. Sisanya dibiarkan
  -- LOCKED; karena gerbangnya OPEN, mesin gerbang membukanya pada pembacaan
  -- pertama dan mengisi `unlockedAt` saat itu.
  CASE WHEN s."order" = first_stage."minOrder" THEN CURRENT_TIMESTAMP ELSE NULL END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "challenge_enrollments" e
JOIN "challenge_sections" s ON s."challengeId" = e."challengeId"
JOIN (
  SELECT "challengeId", MIN("order") AS "minOrder"
  FROM "challenge_sections"
  GROUP BY "challengeId"
) first_stage ON first_stage."challengeId" = e."challengeId"
WHERE e."status" IN ('ENROLLED', 'IN_PROGRESS');
