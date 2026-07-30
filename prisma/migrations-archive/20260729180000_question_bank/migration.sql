-- Bank soal modular.
--
-- Sampai sekarang satuan terkecil yang bisa dipakai ulang adalah satu ujian
-- utuh (`challenges.isTemplate`), dan menyalinnya berarti mengambil seluruh
-- section beserta soalnya. Tabel ini membuat satu soal bisa berdiri sendiri,
-- sehingga perusahaan dapat memungut soal per topik lalu menyusun tahapannya
-- sendiri.
--
-- `companyId` NULL berarti milik platform dan terlihat semua perusahaan;
-- terisi berarti koleksi pribadi yang hanya terlihat pemiliknya.
CREATE TABLE "question_bank_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "type" "ComponentType" NOT NULL,
    "question" TEXT NOT NULL,
    "description" TEXT,
    "options" JSONB,
    "metadata" JSONB,
    "defaultPoints" INTEGER NOT NULL DEFAULT 10,
    -- NULL berarti berlaku lintas bidang. Soal soft skill dan wawancara tidak
    -- dimiliki satu kategori pekerjaan pun; memaksanya memilih salah satu akan
    -- menyembunyikannya dari perusahaan yang mencari peran lain.
    "category" "ChallengeCategory",
    "difficulty" "ChallengeDifficulty" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_bank_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "question_bank_items_companyId_category_difficulty_idx" ON "question_bank_items"("companyId", "category", "difficulty");

CREATE INDEX "question_bank_items_isActive_category_idx" ON "question_bank_items"("isActive", "category");

ALTER TABLE "question_bank_items" ADD CONSTRAINT "question_bank_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Penanda topik soal memakai kosakata `skills` yang sudah ada, bukan daftar
-- tag tersendiri. Dua perbendaharaan kata yang terpisah pasti menyimpang:
-- "Node.js" milik talenta tidak akan cocok dengan "NodeJS" milik soal.
CREATE TABLE "question_bank_item_skills" (
    "itemId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "question_bank_item_skills_pkey" PRIMARY KEY ("itemId","skillId")
);

CREATE INDEX "question_bank_item_skills_skillId_idx" ON "question_bank_item_skills"("skillId");

ALTER TABLE "question_bank_item_skills" ADD CONSTRAINT "question_bank_item_skills_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "question_bank_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "question_bank_item_skills" ADD CONSTRAINT "question_bank_item_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Jejak asal soal yang dipungut dari bank.
--
-- Hanya jejak: isi soal disalin saat dipungut, tidak dibaca lewat relasi ini.
-- Kalau dibaca, menyunting soal di bank akan mengubah ujian yang sedang
-- dikerjakan kandidat, dan `component_responses` yang menunjuk baris ini akan
-- menggantung ke pertanyaan yang berbeda dari yang dijawab. ON DELETE SET NULL
-- supaya menghapus soal dari bank tidak ikut menghapus ujian yang memakainya.
ALTER TABLE "challenge_components" ADD COLUMN "sourceItemId" TEXT;

CREATE INDEX "challenge_components_sourceItemId_idx" ON "challenge_components"("sourceItemId");

ALTER TABLE "challenge_components" ADD CONSTRAINT "challenge_components_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "question_bank_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
