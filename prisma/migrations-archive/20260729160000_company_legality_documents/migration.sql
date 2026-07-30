-- Berkas legalitas usaha yang dikirim perusahaan untuk ditinjau admin.
--
-- Sebelum ini POST /verification/kyb menerima nomor registrasi dan tautan
-- dokumennya lalu membuangnya: hanya "kybStatus" yang berubah, dan langsung ke
-- VERIFIED pada permintaan itu juga. Artinya perusahaan memverifikasi dirinya
-- sendiri, dan antrean tinjauan admin berisi kartu tanpa satu pun dokumen.
ALTER TABLE "company_profiles" ADD COLUMN "legalEntityName" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN "businessRegistrationNumber" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN "legalDocumentUrl" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN "kybSubmittedAt" TIMESTAMP(3);

-- Status VERIFIED yang terlanjur ditetapkan sendiri oleh perusahaan tidak bisa
-- dipercaya: tidak ada dokumen yang pernah ditinjau siapa pun. Yang sudah
-- diaktifkan admin (users."isVerified" = true) dibiarkan apa adanya supaya
-- perusahaan yang sedang berjalan tidak ikut terputus; sisanya dikembalikan ke
-- UNVERIFIED agar melewati peninjauan yang sebenarnya.
UPDATE "company_profiles" cp
SET "kybStatus" = 'UNVERIFIED'
FROM "users" u
WHERE cp."userId" = u."id"
  AND cp."kybStatus" = 'VERIFIED'
  AND u."isVerified" = false;
