-- Bidang pekerjaan pindah dari enum `ChallengeCategory` ke kosakata `skills`,
-- yang sama dengan yang dipakai keahlian talenta.
--
-- Enum berarti bidang baru butuh migrasi basis data; perusahaan yang mencari
-- Video Editor terpaksa memilih OTHER. Setelah ini bidang baru cukup ditulis
-- perusahaan dan langsung menjadi baris `skills`.

-- 1. Pastikan enam bidang lama ada di direktori sebelum dipakai sebagai acuan.
INSERT INTO "skills" ("id", "name", "createdAt")
SELECT gen_random_uuid(), v.name, NOW()
FROM (VALUES
  ('Frontend Development'),
  ('Backend Development'),
  ('UI/UX Design'),
  ('Data Science / ML'),
  ('Digital Marketing'),
  ('Product Management')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM "skills" s WHERE LOWER(s."name") = LOWER(v.name)
);

-- 2. Kolom baru.
ALTER TABLE "challenges" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "question_bank_items" ADD COLUMN "categoryId" TEXT;

-- 3. Pindahkan nilai enum ke acuan direktori. OTHER (dan NULL di bank soal)
--    menjadi NULL: keduanya berarti "lintas bidang".
UPDATE "challenges" c
SET "categoryId" = s."id"
FROM "skills" s
WHERE LOWER(s."name") = LOWER(
  CASE c."category"::text
    WHEN 'FRONTEND' THEN 'Frontend Development'
    WHEN 'BACKEND' THEN 'Backend Development'
    WHEN 'UI_UX' THEN 'UI/UX Design'
    WHEN 'DATA_SCIENCE' THEN 'Data Science / ML'
    WHEN 'MARKETING' THEN 'Digital Marketing'
    WHEN 'PRODUCT' THEN 'Product Management'
  END
);

UPDATE "question_bank_items" q
SET "categoryId" = s."id"
FROM "skills" s
WHERE LOWER(s."name") = LOWER(
  CASE q."category"::text
    WHEN 'FRONTEND' THEN 'Frontend Development'
    WHEN 'BACKEND' THEN 'Backend Development'
    WHEN 'UI_UX' THEN 'UI/UX Design'
    WHEN 'DATA_SCIENCE' THEN 'Data Science / ML'
    WHEN 'MARKETING' THEN 'Digital Marketing'
    WHEN 'PRODUCT' THEN 'Product Management'
  END
);

-- 4. Buang kolom enum lama beserta indeksnya.
DROP INDEX IF EXISTS "challenges_category_idx";
DROP INDEX IF EXISTS "question_bank_items_companyId_category_difficulty_idx";
DROP INDEX IF EXISTS "question_bank_items_isActive_category_idx";

ALTER TABLE "challenges" DROP COLUMN "category";
ALTER TABLE "question_bank_items" DROP COLUMN "category";

DROP TYPE "ChallengeCategory";

-- 5. Indeks dan kunci asing baru.
CREATE INDEX "challenges_categoryId_idx" ON "challenges"("categoryId");
CREATE INDEX "question_bank_items_companyId_categoryId_difficulty_idx" ON "question_bank_items"("companyId", "categoryId", "difficulty");
CREATE INDEX "question_bank_items_isActive_categoryId_idx" ON "question_bank_items"("isActive", "categoryId");

ALTER TABLE "challenges"
  ADD CONSTRAINT "challenges_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "question_bank_items"
  ADD CONSTRAINT "question_bank_items_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
