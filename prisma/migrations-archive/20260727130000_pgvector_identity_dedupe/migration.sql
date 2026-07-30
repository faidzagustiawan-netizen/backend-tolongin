-- Deteksi duplikat wajah berbasis embedding.
--
-- Sebelumnya aturan "1 wajah 1 akun" hanya bersandar pada biometricDataHash,
-- yaitu sha256 dari byte berkas selfie. Dua foto orang yang sama menghasilkan
-- hash yang sama sekali berbeda, sehingga aturan itu praktis hanya menangkap
-- unggahan berkas yang identik. Perbandingan yang sebenarnya membutuhkan
-- embedding wajah dan pencarian tetangga terdekat.

CREATE EXTENSION IF NOT EXISTS vector;

-- Kolom lama bertipe JSON dan satu-satunya penulisnya adalah endpoint
-- pembaruan profil, yang berarti isinya berasal dari peramban dan tidak boleh
-- dipercaya. Isinya dibuang, bukan dimigrasikan.
ALTER TABLE "talent_profiles" DROP COLUMN IF EXISTS "biometricFeatureVector";
ALTER TABLE "talent_profiles" ADD COLUMN "biometricFeatureVector" vector(128);

ALTER TABLE "talent_profiles" ADD COLUMN "faceAlignmentDegraded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "talent_profiles" ADD COLUMN "needsIdentityReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "talent_profiles" ADD COLUMN "duplicateCheckDistance" DOUBLE PRECISION;
ALTER TABLE "talent_profiles" ADD COLUMN "duplicateCheckMatchId" TEXT;
ALTER TABLE "talent_profiles" ADD COLUMN "identityReviewedAt" TIMESTAMP(3);
ALTER TABLE "talent_profiles" ADD COLUMN "identityReviewedBy" TEXT;

-- HNSW memberi pencarian tetangga terdekat yang sublinear, sehingga biaya
-- pemeriksaan duplikat tidak tumbuh sebanding jumlah pengguna.
-- Operator class cosine dipilih karena embedding sudah di-L2-normalize.
CREATE INDEX "talent_profiles_biometric_vector_idx"
  ON "talent_profiles"
  USING hnsw ("biometricFeatureVector" vector_cosine_ops);

CREATE INDEX "talent_profiles_needsIdentityReview_idx"
  ON "talent_profiles"("needsIdentityReview");
