-- Kolom masa berlaku kode undangan tim.
-- Kode lama tidak punya tanggal kedaluwarsa, jadi seluruhnya dikosongkan:
-- pemilik perusahaan menerbitkan ulang lewat POST /companies/workspace/invite-code.
ALTER TABLE "company_profiles" ADD COLUMN "inviteCodeExpiresAt" TIMESTAMP(3);
UPDATE "company_profiles" SET "inviteCode" = NULL;

-- ==========================================
-- Indeks jalur panas
-- Dibuat CONCURRENTLY tidak bisa di dalam transaksi migrasi Prisma, jadi
-- dipakai CREATE INDEX biasa. Untuk basis data besar, jalankan varian
-- CONCURRENTLY secara manual lebih dulu lalu tandai migrasi ini sebagai applied.
-- ==========================================

-- Antrean evaluasi AI: WHERE status = 'PENDING_AI' ORDER BY "createdAt" ASC
CREATE INDEX "submissions_status_createdAt_idx" ON "submissions"("status", "createdAt");
CREATE INDEX "submissions_challengeId_status_idx" ON "submissions"("challengeId", "status");
CREATE INDEX "submissions_talentId_idx" ON "submissions"("talentId");
CREATE INDEX "submissions_enrollmentId_idx" ON "submissions"("enrollmentId");

-- Direktori challenge publik
CREATE INDEX "challenges_status_isPrivate_createdAt_idx" ON "challenges"("status", "isPrivate", "createdAt" DESC);
CREATE INDEX "challenges_companyId_idx" ON "challenges"("companyId");
CREATE INDEX "challenges_category_idx" ON "challenges"("category");
CREATE INDEX "challenges_difficulty_idx" ON "challenges"("difficulty");

-- Leaderboard talenta
CREATE INDEX "talent_profiles_xp_idx" ON "talent_profiles"("xp" DESC);

-- Dashboard talenta
CREATE INDEX "challenge_enrollments_talentId_updatedAt_idx" ON "challenge_enrollments"("talentId", "updatedAt" DESC);
CREATE INDEX "challenge_enrollments_challengeId_idx" ON "challenge_enrollments"("challengeId");

-- Lonceng notifikasi
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt" DESC);

-- Diskusi per challenge
CREATE INDEX "discussions_challengeId_createdAt_idx" ON "discussions"("challengeId", "createdAt");
CREATE INDEX "discussions_parentId_idx" ON "discussions"("parentId");

-- Riwayat transaksi
CREATE INDEX "payment_transactions_userId_createdAt_idx" ON "payment_transactions"("userId", "createdAt" DESC);
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions"("status");
CREATE INDEX "token_transactions_userId_createdAt_idx" ON "token_transactions"("userId", "createdAt" DESC);

-- Direktori perusahaan dan cron penurunan tier langganan
CREATE INDEX "company_profiles_trustScore_idx" ON "company_profiles"("trustScore" DESC);
CREATE INDEX "company_profiles_subscriptionExpiresAt_idx" ON "company_profiles"("subscriptionExpiresAt");
