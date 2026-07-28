-- Pindah dari Facenet (128 dimensi) ke Facenet512.
--
-- Alasannya akurasi. Pasangan selfie-vs-KTP berjarak lebar karena foto pada
-- kartu adalah hasil cetak beresolusi rendah, sehingga ruang antara "orang
-- yang sama" dan "orang berbeda" menjadi sempit. Facenet512 memisahkan
-- identitas jauh lebih tajam pada kondisi seperti itu.
--
-- Embedding lintas model tidak sebanding, jadi kolomnya dibuat ulang dan
-- seluruh isinya dikosongkan. Saat migrasi ini dibuat belum ada satu pun
-- vektor tersimpan, sehingga tidak ada data yang hilang. Kalau di lingkungan
-- lain sudah ada isinya, jalankan ulang
-- scripts/backfill-biometric-vectors.ts setelah migrasi.

DROP INDEX IF EXISTS "talent_profiles_biometric_vector_idx";

ALTER TABLE "talent_profiles" DROP COLUMN IF EXISTS "biometricFeatureVector";
ALTER TABLE "talent_profiles" ADD COLUMN "biometricFeatureVector" vector(512);

-- Profil yang sudah terverifikasi tidak lagi punya acuan biometrik yang sah
-- sampai di-backfill, jadi penandanya dikembalikan.
UPDATE "talent_profiles" SET "faceAlignmentDegraded" = false;

CREATE INDEX "talent_profiles_biometric_vector_idx"
  ON "talent_profiles"
  USING hnsw ("biometricFeatureVector" vector_cosine_ops);
