-- Baseline skema. Menggantikan riwayat migrasi yang tidak bisa dijalankan.
--
-- Riwayat sebelumnya tidak pernah bisa membangun basis data dari kosong. Dasar
-- skemanya dulu dibuat lewat `prisma db push`, sehingga sebagian tabel dan kolom
-- tidak pernah punya migrasi sendiri, sementara migrasi berikutnya tetap
-- meng-ALTER benda-benda itu. `prisma migrate deploy` pada basis data kosong
-- gagal di migrasi kedua:
--
--   ERROR: column "inviteCode" of relation "company_profiles" does not exist
--
-- Ukuran selisihnya: `20260518083502_init` membuat 11 tabel, sedangkan
-- `schema.prisma` mendefinisikan 29 model. `challenge_sections` tidak pernah
-- dibuat satu pun migrasi padahal dua migrasi meng-ALTER-nya.
--
-- Berkas ini dihasilkan dari `schema.prisma`, satu-satunya sumber kebenaran yang
-- utuh:
--
--   prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
--
-- Migrasi lama dipindahkan ke `prisma/migrations-archive/`, tidak dihapus:
-- isinya memuat catatan keputusan atas data produksi yang masih layak dibaca.
-- Prisma tidak membaca direktori itu.
--
-- ## Dua bagian yang ditulis tangan
--
-- `prisma migrate diff` tidak bisa menghasilkan keduanya, jadi keduanya disalin
-- dari migrasi lama dan HARUS ikut terbawa bila berkas ini kelak dibuat ulang:
--
-- 1. `CREATE EXTENSION vector` — kolom `biometricFeatureVector` bertipe
--    `Unsupported("vector(512)")`, dan Prisma hanya menghasilkan DDL extension
--    bila preview `postgresqlExtensions` aktif, yang tidak dipakai di sini.
-- 2. Indeks HNSW di akhir berkas — Prisma tidak bisa mengindeks kolom
--    `Unsupported`. Tanpa indeks itu pencarian tetangga terdekat untuk
--    deduplikasi wajah berubah menjadi pemindaian seluruh tabel.
--
-- ## Basis data yang sudah ada
--
-- JANGAN menjalankan berkas ini di basis data yang sudah berisi skema. Adopsinya
-- lewat `prisma migrate resolve --applied 0_init`, yang hanya menandai baseline
-- ini sebagai sudah diterapkan tanpa menyentuh satu tabel pun. Lihat
-- `prisma/migrations-archive/README.md`.

CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('TALENT', 'COMPANY', 'ADMIN');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('STARTUP', 'KONGLOMERAT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ChallengeType" AS ENUM ('COMPANY', 'PUBLIC');

-- CreateEnum
CREATE TYPE "ChallengeCategory" AS ENUM ('UI_UX', 'FRONTEND', 'BACKEND', 'DATA_SCIENCE', 'MARKETING', 'PRODUCT');

-- CreateEnum
CREATE TYPE "ChallengeDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SectionStageType" AS ENUM ('QUIZ', 'ASSIGNMENT');

-- CreateEnum
CREATE TYPE "StageGateMode" AS ENUM ('OPEN', 'MIN_SCORE', 'TOP_N', 'MANUAL_APPROVAL');

-- CreateEnum
CREATE TYPE "GateScoreBasis" AS ENUM ('PREVIOUS_STAGE', 'CUMULATIVE', 'SPECIFIC_STAGES');

-- CreateEnum
CREATE TYPE "StagePendingPolicy" AS ENUM ('WAIT_FOR_SCORE', 'AUTO_ADVANCE_AFTER', 'MANUAL_ONLY');

-- CreateEnum
CREATE TYPE "StageAttemptStatus" AS ENUM ('LOCKED', 'IN_PROGRESS', 'SUBMITTED', 'AWAITING_GRADE', 'PASSED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ComponentType" AS ENUM ('MULTIPLE_CHOICE', 'ESSAY', 'FILE_UPLOAD', 'VIDEO_UPLOAD', 'URL_SUBMISSION', 'LIVE_CODING', 'PSYCHOMETRIC');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ENROLLED', 'IN_PROGRESS', 'SUBMITTED', 'EVALUATED', 'DROPPED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING_AI', 'UNDER_REVIEW', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "HiringStatus" AS ENUM ('NONE', 'SHORTLISTED', 'INTERVIEW_INVITED', 'HIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('EARN', 'SPEND');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('TOKEN_TOPUP', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AnnouncementType" AS ENUM ('INFO', 'WARNING', 'SUCCESS', 'MAINTENANCE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'TALENT',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_profiles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "headline" TEXT,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "resumeUrl" TEXT,
    "skills" TEXT[],
    "githubUrl" TEXT,
    "linkedinUrl" TEXT,
    "figmaUrl" TEXT,
    "faceVerificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "ktpNik" TEXT,
    "biometricDataHash" TEXT,
    "biometricFeatureVector" vector(512),
    "faceAlignmentDegraded" BOOLEAN NOT NULL DEFAULT false,
    "needsIdentityReview" BOOLEAN NOT NULL DEFAULT false,
    "duplicateCheckDistance" DOUBLE PRECISION,
    "duplicateCheckMatchId" TEXT,
    "identityReviewedAt" TIMESTAMP(3),
    "identityReviewedBy" TEXT,
    "location" TEXT,
    "roleCategory" TEXT,
    "encryptedPrivateFace" TEXT,
    "encryptedKtpData" TEXT,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "tokenBalance" INTEGER NOT NULL DEFAULT 0,
    "showcasedSubmissionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "talent_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiences" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "employmentType" TEXT,
    "locationType" TEXT,
    "location" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educations" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "degree" TEXT,
    "fieldOfStudy" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "grade" TEXT,
    "activities" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "educations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_profiles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "description" TEXT,
    "websiteUrl" TEXT,
    "industry" TEXT NOT NULL,
    "companySize" TEXT,
    "location" TEXT,
    "linkedinUrl" TEXT,
    "legalEntityName" TEXT,
    "businessRegistrationNumber" TEXT,
    "legalDocumentUrl" TEXT,
    "kybSubmittedAt" TIMESTAMP(3),
    "kybStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'STARTUP',
    "subscriptionExpiresAt" TIMESTAMP(3),
    "trustScore" INTEGER NOT NULL DEFAULT 100,
    "inviteCode" TEXT,
    "inviteCodeExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_members" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_activity_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "talentId" TEXT,
    "challengeType" "ChallengeType" NOT NULL DEFAULT 'COMPANY',
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ChallengeCategory" NOT NULL,
    "difficulty" "ChallengeDifficulty" NOT NULL,
    "datasetUrl" TEXT,
    "mockApiUrl" TEXT,
    "brandGuidelineUrl" TEXT,
    "briefAttachments" JSONB,
    "gradingRubric" JSONB NOT NULL,
    "proctoringSettings" JSONB,
    "rewardDescription" TEXT,
    "startsAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByAi" BOOLEAN NOT NULL DEFAULT false,
    "aiPromptUsed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_sections" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "stageType" "SectionStageType" NOT NULL DEFAULT 'ASSIGNMENT',
    "timeLimit" INTEGER,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "gateMode" "StageGateMode" NOT NULL DEFAULT 'OPEN',
    "minScore" DOUBLE PRECISION,
    "maxAdvancing" INTEGER,
    "scoreBasis" "GateScoreBasis" NOT NULL DEFAULT 'PREVIOUS_STAGE',
    "gateSourceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pendingPolicy" "StagePendingPolicy" NOT NULL DEFAULT 'WAIT_FOR_SCORE',
    "graceDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "challenge_components" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "sectionId" TEXT,
    "type" "ComponentType" NOT NULL,
    "question" TEXT NOT NULL,
    "description" TEXT,
    "options" JSONB,
    "metadata" JSONB,
    "points" INTEGER NOT NULL DEFAULT 10,
    "order" INTEGER NOT NULL DEFAULT 0,
    "sourceItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_bank_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "type" "ComponentType" NOT NULL,
    "question" TEXT NOT NULL,
    "description" TEXT,
    "options" JSONB,
    "metadata" JSONB,
    "defaultPoints" INTEGER NOT NULL DEFAULT 10,
    "category" "ChallengeCategory",
    "difficulty" "ChallengeDifficulty" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_bank_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_bank_item_skills" (
    "itemId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "question_bank_item_skills_pkey" PRIMARY KEY ("itemId","skillId")
);

-- CreateTable
CREATE TABLE "challenge_enrollments" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ENROLLED',
    "ndaSignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "draftData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "sectionId" TEXT,
    "stageAttemptId" TEXT,
    "solutionFilesUrl" TEXT,
    "repositoryUrl" TEXT,
    "figmaUrl" TEXT,
    "liveDemoUrl" TEXT,
    "notes" TEXT,
    "slaReminderSentAt" TIMESTAMP(3),
    "aiPlagiarismScore" DOUBLE PRECISION,
    "aiCorrectionSummary" TEXT,
    "aiScore" DOUBLE PRECISION,
    "softSkillScore" DOUBLE PRECISION,
    "softSkillFeedback" TEXT,
    "psychometricProfile" JSONB,
    "weaknessTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "finalScore" DOUBLE PRECISION,
    "reviewerFeedback" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING_AI',
    "hiringStatus" "HiringStatus" NOT NULL DEFAULT 'NONE',
    "autoPassed" BOOLEAN NOT NULL DEFAULT false,
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_responses" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "textValue" TEXT,
    "fileUrl" TEXT,
    "score" DOUBLE PRECISION,
    "aiFeedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "component_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discussions" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discussions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolios" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "verifiedBadgeUrl" TEXT,
    "showcaseSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badges" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "iconUrl" TEXT NOT NULL,
    "requiredXp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_badges" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "talent_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "linkUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "TokenType" NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "checkoutUrl" TEXT,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentType" "PaymentType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_replies" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "AnnouncementType" NOT NULL DEFAULT 'INFO',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "talent_profiles_slug_key" ON "talent_profiles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "talent_profiles_userId_key" ON "talent_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "talent_profiles_ktpNik_key" ON "talent_profiles"("ktpNik");

-- CreateIndex
CREATE UNIQUE INDEX "talent_profiles_biometricDataHash_key" ON "talent_profiles"("biometricDataHash");

-- CreateIndex
CREATE INDEX "talent_profiles_xp_idx" ON "talent_profiles"("xp" DESC);

-- CreateIndex
CREATE INDEX "talent_profiles_needsIdentityReview_idx" ON "talent_profiles"("needsIdentityReview");

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE UNIQUE INDEX "company_profiles_slug_key" ON "company_profiles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "company_profiles_userId_key" ON "company_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "company_profiles_inviteCode_key" ON "company_profiles"("inviteCode");

-- CreateIndex
CREATE INDEX "company_profiles_trustScore_idx" ON "company_profiles"("trustScore" DESC);

-- CreateIndex
CREATE INDEX "company_profiles_subscriptionExpiresAt_idx" ON "company_profiles"("subscriptionExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "company_members_userId_key" ON "company_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "challenges_slug_key" ON "challenges"("slug");

-- CreateIndex
CREATE INDEX "challenges_status_isPrivate_createdAt_idx" ON "challenges"("status", "isPrivate", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "challenges_companyId_idx" ON "challenges"("companyId");

-- CreateIndex
CREATE INDEX "challenges_category_idx" ON "challenges"("category");

-- CreateIndex
CREATE INDEX "challenges_difficulty_idx" ON "challenges"("difficulty");

-- CreateIndex
CREATE INDEX "stage_attempts_status_expiresAt_idx" ON "stage_attempts"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "stage_attempts_sectionId_score_idx" ON "stage_attempts"("sectionId", "score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "stage_attempts_enrollmentId_sectionId_key" ON "stage_attempts"("enrollmentId", "sectionId");

-- CreateIndex
CREATE INDEX "challenge_components_sourceItemId_idx" ON "challenge_components"("sourceItemId");

-- CreateIndex
CREATE INDEX "question_bank_items_companyId_category_difficulty_idx" ON "question_bank_items"("companyId", "category", "difficulty");

-- CreateIndex
CREATE INDEX "question_bank_items_isActive_category_idx" ON "question_bank_items"("isActive", "category");

-- CreateIndex
CREATE INDEX "question_bank_item_skills_skillId_idx" ON "question_bank_item_skills"("skillId");

-- CreateIndex
CREATE INDEX "challenge_enrollments_talentId_updatedAt_idx" ON "challenge_enrollments"("talentId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "challenge_enrollments_challengeId_idx" ON "challenge_enrollments"("challengeId");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_enrollments_talentId_challengeId_key" ON "challenge_enrollments"("talentId", "challengeId");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_stageAttemptId_key" ON "submissions"("stageAttemptId");

-- CreateIndex
CREATE INDEX "submissions_status_createdAt_idx" ON "submissions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "submissions_challengeId_status_idx" ON "submissions"("challengeId", "status");

-- CreateIndex
CREATE INDEX "submissions_talentId_idx" ON "submissions"("talentId");

-- CreateIndex
CREATE INDEX "submissions_enrollmentId_idx" ON "submissions"("enrollmentId");

-- CreateIndex
CREATE INDEX "submissions_sectionId_idx" ON "submissions"("sectionId");

-- CreateIndex
CREATE INDEX "discussions_challengeId_createdAt_idx" ON "discussions"("challengeId", "createdAt");

-- CreateIndex
CREATE INDEX "discussions_parentId_idx" ON "discussions"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "portfolios_submissionId_key" ON "portfolios"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "badges_title_key" ON "badges"("title");

-- CreateIndex
CREATE UNIQUE INDEX "talent_badges_talentId_badgeId_key" ON "talent_badges"("talentId", "badgeId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "token_transactions_userId_createdAt_idx" ON "token_transactions"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_externalId_key" ON "payment_transactions"("externalId");

-- CreateIndex
CREATE INDEX "payment_transactions_userId_createdAt_idx" ON "payment_transactions"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions"("status");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_profiles" ADD CONSTRAINT "talent_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educations" ADD CONSTRAINT "educations_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_activity_logs" ADD CONSTRAINT "company_activity_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_activity_logs" ADD CONSTRAINT "company_activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "talent_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_sections" ADD CONSTRAINT "challenge_sections_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_attempts" ADD CONSTRAINT "stage_attempts_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "challenge_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_attempts" ADD CONSTRAINT "stage_attempts_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "challenge_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_components" ADD CONSTRAINT "challenge_components_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_components" ADD CONSTRAINT "challenge_components_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "challenge_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_components" ADD CONSTRAINT "challenge_components_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "question_bank_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank_items" ADD CONSTRAINT "question_bank_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank_item_skills" ADD CONSTRAINT "question_bank_item_skills_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "question_bank_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank_item_skills" ADD CONSTRAINT "question_bank_item_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_enrollments" ADD CONSTRAINT "challenge_enrollments_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_enrollments" ADD CONSTRAINT "challenge_enrollments_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "challenge_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "challenge_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_stageAttemptId_fkey" FOREIGN KEY ("stageAttemptId") REFERENCES "stage_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_responses" ADD CONSTRAINT "component_responses_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_responses" ADD CONSTRAINT "component_responses_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "challenge_components"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussions" ADD CONSTRAINT "discussions_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussions" ADD CONSTRAINT "discussions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_badges" ADD CONSTRAINT "talent_badges_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_badges" ADD CONSTRAINT "talent_badges_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_transactions" ADD CONSTRAINT "token_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_audit_logs" ADD CONSTRAINT "system_audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_replies" ADD CONSTRAINT "ticket_replies_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_replies" ADD CONSTRAINT "ticket_replies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Indeks tetangga terdekat untuk deduplikasi identitas biometrik. Disalin dari
-- `20260728080000_facenet512_embeddings`; tidak bisa dinyatakan di schema.prisma
-- karena kolomnya bertipe `Unsupported`.
CREATE INDEX "talent_profiles_biometric_vector_idx"
  ON "talent_profiles"
  USING hnsw ("biometricFeatureVector" vector_cosine_ops);
