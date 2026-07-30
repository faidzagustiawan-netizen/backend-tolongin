-- Membubarkan template paket-jadi menjadi bahan bank soal.
--
-- Template lama adalah satu Challenge utuh bertanda `isTemplate`, dan satu-
-- satunya cara memakainya adalah menyalin seluruhnya. Bank soal menggantikannya
-- dengan satuan yang jauh lebih berguna: satu soal, bisa dipungut per topik dan
-- disusun sendiri tahapannya.
--
-- Di basis data produksi tidak ada satu pun baris `isTemplate = true`, jadi
-- pemindahan di bawah ini tidak memindahkan apa-apa. Tetap dijalankan supaya
-- lingkungan lain yang sempat menjalankan seed-templates tidak kehilangan
-- soalnya begitu kolomnya dibuang.

-- 1. Setiap komponen milik template menjadi satu soal di bank platform.
INSERT INTO "question_bank_items" (
    "id", "companyId", "type", "question", "description",
    "options", "metadata", "defaultPoints", "category", "difficulty",
    "isActive", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid(),
    NULL,
    cc."type",
    cc."question",
    cc."description",
    cc."options",
    cc."metadata",
    cc."points",
    c."category",
    c."difficulty",
    true,
    NOW(),
    NOW()
FROM "challenge_components" cc
JOIN "challenges" c ON c."id" = cc."challengeId"
WHERE c."isTemplate" IS TRUE;

-- 2. Challenge template dihapus.
--
-- Wajib, bukan pilihan: begitu kolom `isTemplate` hilang, baris-baris ini
-- menjadi challenge biasa berstatus PUBLISHED dan akan muncul di direktori
-- publik sebagai studi kasus sungguhan tanpa pemilik yang bertanggung jawab.
-- Section dan komponennya ikut terhapus lewat ON DELETE CASCADE.
DELETE FROM "challenges" WHERE "isTemplate" IS TRUE;

-- 3. Konsep template dilepas dari skema.
ALTER TABLE "challenges" DROP COLUMN "isTemplate";
ALTER TABLE "challenges" DROP COLUMN "templateRole";
