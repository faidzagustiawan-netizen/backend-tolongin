# Struktur Basis Data — Tolongin.co

**Dokumen**: DatabaseSchema · sumber `backend/prisma/schema.prisma` · analisis 2026-08-06

> Istilah teknis dijelaskan di [glosarium](README.md#glosarium). Bagian berjudul **"— rincian teknis"** aman dilewati bila Anda tidak menulis kode.

---

## 1. Apa yang sistem ingat

Basis data adalah gudang arsip Tolongin. Ada **29 laci** (tabel). Isinya bisa diringkas jadi lima cerita:

| Cerita | Yang disimpan | Jumlah laci |
|---|---|---|
| **Tentang orang** | Akun, profil kandidat, pengalaman kerja, pendidikan, keahlian, data identitas | 7 |
| **Tentang perusahaan** | Profil perusahaan, dokumen legalitas, anggota tim, catatan aktivitas internal | 3 |
| **Tentang ujian** | Studi kasus, tahapan, soal, bank soal, pendaftaran, pengerjaan tiap tahap, jawaban | 8 |
| **Tentang hasil** | Submisi dan nilainya, portofolio, lencana, diskusi, notifikasi | 6 |
| **Tentang uang dan operasional** | Transaksi token, transaksi pembayaran, log audit, tiket bantuan, pengumuman | 5 |

Beberapa hal yang layak diketahui meski Anda tidak menulis kode:

- **Kata sandi tidak pernah disimpan.** Yang disimpan sidik jarinya. Bocornya isi tabel tidak berarti kata sandi ikut bocor.
- **Token pemulihan kata sandi pun disimpan sebagai sidik jari**, sekali pakai, dan seluruh token milik orang itu dihapus setelah kata sandinya berhasil diganti.
- **Foto KTP dan selfie disimpan dalam keadaan terenkripsi.**
- **Data wajah** disimpan sebagai deretan angka, dengan cara yang membuatnya tidak bisa ikut terbawa keluar lewat API — bukan karena dilarang aturan, tapi karena secara teknis tidak terjangkau dari jalur itu.
- **Data yang sudah jadi bukti tidak dihapus.** Studi kasus yang ditindak admin hanya disembunyikan; soal yang ditarik dari peredaran tetap disimpan demi ujian yang sudah memakainya; submisi lama tetap sah meski bentuk penilaiannya sudah berubah.

## 2. Kenapa strukturnya seperti ini

Tiga keputusan yang paling menentukan bentuk gudang ini:

**Keahlian, bidang pekerjaan, dan topik soal memakai satu daftar yang sama.**
Kalau dipisah, "Node.js" milik kandidat tidak akan pernah cocok dengan "NodeJS" milik soal, dan pencarian jadi meleset. Karena satu daftar, "Frontend Development" yang dicari perusahaan adalah baris yang **persis sama** dengan yang tertulis di profil kandidat.

**Bidang pekerjaan bukan daftar tertutup.**
Dulu hanya ada enam pilihan tetap. Perusahaan yang mencari Video Editor terpaksa memilih "Lainnya", dan bidang sebenarnya cuma tersimpan sebagai teks bebas. Sekarang bidang baru bisa ditambahkan saat itu juga tanpa mengubah struktur basis data.

**Satu tahap ujian punya catatan pengerjaannya sendiri.**
Dulu satu ujian hanya punya satu catatan hasil, jadi tidak ada angka per tahap yang bisa dibandingkan dengan syarat lolos — dan batas waktu per tahap tersimpan tanpa ada yang menegakkannya.

---

## 3. Ringkasan teknis

| Item | Nilai |
|---|---|
| Mesin | PostgreSQL (Supabase) + extension **pgvector** |
| ORM | Prisma 7 (`prisma-client-js`) dengan adapter `@prisma/adapter-pg` |
| Jumlah model | **29** |
| Jumlah enum | **20** |
| Konvensi id | `String @id @default(uuid())` di seluruh model |
| Konvensi nama tabel | `@@map` ke snake_case jamak (`users`, `talent_profiles`, …) |
| Stempel waktu | `createdAt @default(now())` + `updatedAt @updatedAt` di hampir semua model |

## 4. Daftar enum — rincian teknis

| Enum | Nilai |
|---|---|
| `Role` | TALENT · COMPANY · ADMIN |
| `VerificationStatus` | UNVERIFIED · PENDING · VERIFIED · FAILED |
| `SubscriptionTier` | STARTUP · KONGLOMERAT · CUSTOM |
| `ChallengeType` | COMPANY · PUBLIC |
| `ChallengeDifficulty` | BEGINNER · INTERMEDIATE · ADVANCED |
| `ChallengeStatus` | DRAFT · PUBLISHED · CLOSED |
| `StageGateMode` | OPEN · MIN_SCORE · TOP_N · MANUAL_APPROVAL |
| `GateScoreBasis` | PREVIOUS_STAGE · CUMULATIVE · SPECIFIC_STAGES |
| `StagePendingPolicy` | WAIT_FOR_SCORE · AUTO_ADVANCE_AFTER · MANUAL_ONLY |
| `StageAttemptStatus` | LOCKED · IN_PROGRESS · SUBMITTED · AWAITING_GRADE · PASSED · FAILED · EXPIRED |
| `ComponentType` | MULTIPLE_CHOICE · ESSAY · FILE_UPLOAD · VIDEO_UPLOAD · URL_SUBMISSION · LIVE_CODING · PSYCHOMETRIC |
| `EnrollmentStatus` | ENROLLED · IN_PROGRESS · SUBMITTED · EVALUATED · DROPPED |
| `SubmissionStatus` | PENDING_AI · UNDER_REVIEW · PASSED · FAILED |
| `HiringStatus` | NONE · SHORTLISTED · INTERVIEW_INVITED · HIRED · REJECTED |
| `BadgeCriteria` | TOTAL_XP · CHALLENGES_PASSED · HIGH_SCORES · DIFFICULTY_PASSED · CATEGORY_BREADTH · IDENTITY_VERIFIED · PORTFOLIO_ENTRIES · DISCUSSION_POSTS · HIRED · SKILLS_LISTED |
| `TokenType` | EARN · SPEND |
| `PaymentStatus` | PENDING · SUCCESS · FAILED · EXPIRED |
| `PaymentType` | TOKEN_TOPUP · SUBSCRIPTION |
| `TicketStatus` | OPEN · IN_PROGRESS · RESOLVED · CLOSED |
| `AnnouncementType` | INFO · WARNING · SUCCESS · MAINTENANCE |

## 5. Tentang orang — rincian teknis

### `User` → `users`
`email` unik · `passwordHash` · `role` (bawaan TALENT) · `isVerified` · `isBanned`.
Relasi 1-1 ke `TalentProfile` dan `CompanyProfile`; 1-N ke keanggotaan tim, log aktivitas, diskusi, notifikasi, transaksi token/pembayaran, audit log, tiket, balasan, token pemulihan kata sandi.

### `PasswordResetToken` → `password_reset_tokens`
`tokenHash` unik (SHA-256 dari token, **bukan** tokennya) · `expiresAt` · `usedAt` (sekali pakai). Indeks `[userId]`.

### `TalentProfile` → `talent_profiles`
Profil publik: `slug` unik, `fullName`, `headline`, `avatarUrl`, `bio`, `resumeUrl`, `skills String[]`, tautan GitHub/LinkedIn/Figma, `location`, `roleCategory`, `showcasedSubmissionIds String[]`.

Identitas dan biometrik:

| Kolom | Catatan |
|---|---|
| `faceVerificationStatus` | `VerificationStatus` |
| `ktpNik` | unik — satu KTP satu akun |
| `biometricDataHash` | unik; hash berkas selfie. Hanya menangkap unggahan identik byte-per-byte, jadi perannya sebatas saringan awal murah |
| `biometricFeatureVector` | `Unsupported("vector(512)")` — embedding Facenet512 ter-L2-normalize. **Tidak dikenali Prisma Client**; akses hanya lewat `$queryRaw` |
| `faceAlignmentDegraded` | wajah gagal diluruskan; verifikasi masih bisa lolos dengan ambang lebih ketat, tetapi embedding tidak disimpan karena tidak layak jadi acuan pembanding |
| `needsIdentityReview`, `duplicateCheckDistance`, `duplicateCheckMatchId`, `identityReviewedAt`, `identityReviewedBy` | hasil pemeriksaan duplikat |
| `encryptedPrivateFace`, `encryptedKtpData` | gambar terenkripsi AES-256 |

Gamifikasi: `xp`, `level`, `tokenBalance`.
Indeks: `[xp desc]` (papan peringkat), `[needsIdentityReview]` (antrean admin).

### `Experience` → `experiences` · `Education` → `educations`
Riwayat kerja dan pendidikan; cascade dari `TalentProfile`.

### `Skill` → `skills`
`name` unik. Satu kosakata untuk tiga peran: keahlian talenta, penanda topik soal (`QuestionBankItemSkill`), dan bidang pekerjaan challenge (relasi `ChallengeJobCategory`).

## 6. Tentang perusahaan — rincian teknis

### `CompanyProfile` → `company_profiles`
Identitas: `slug` unik, `companyName`, `logoUrl`, `description`, `websiteUrl`, `industry`, `companySize`, `location`, `linkedinUrl`.
Legalitas: `legalEntityName`, `businessRegistrationNumber`, `legalDocumentUrl`, `kybSubmittedAt`, `kybStatus`.
Langganan: `subscriptionTier`, `subscriptionExpiresAt`.
Tim: `trustScore` (bawaan 100), `inviteCode` unik + `inviteCodeExpiresAt` — dikosongkan setelah dipakai atau kedaluwarsa.
Indeks: `[trustScore desc]`, `[subscriptionExpiresAt]`.

### `CompanyMember` → `company_members`
`userId` unik (satu akun satu keanggotaan) · `status` `PENDING`/`APPROVED`/`REJECTED`.

### `CompanyActivityLog` → `company_activity_logs`
`action`, `entityType`, `entityId`, `details Json?`.

## 7. Tentang ujian — rincian teknis

### `Challenge` → `challenges`
Kepemilikan ganda: `companyId` (cascade) **atau** `talentId` (`SetNull`, relasi `CreatedChallenges`), sesuai `challengeType`.

| Kelompok | Kolom |
|---|---|
| Isi | `title`, `slug` unik, `summary`, `description`, `role` (posisi yang direkrut), `categoryId` → `Skill` (`SetNull`; null = lintas bidang), `difficulty` |
| Aset | `datasetUrl`, `mockApiUrl`, `brandGuidelineUrl`, `briefAttachments Json?` |
| Penilaian | `gradingRubric Json`, `proctoringSettings Json?` — dipisah dari rubrik supaya perhitungan bobot kriteria tidak perlu menyaringnya keluar |
| Publikasi | `rewardDescription`, `startsAt`, `deadlineAt`, `isPrivate`, `status` |
| Moderasi | `takenDownAt`, `takenDownById`, `takedownReason` |
| Jejak AI | `createdByAi`, `aiPromptUsed` |

Indeks: `[status, isPrivate, createdAt desc]` (direktori publik), `[companyId]`, `[categoryId]`, `[difficulty]`.

### `ChallengeSection` → `challenge_sections`
Satu tahap ujian. `title`, `description`, `order`, `timeLimit` (menit, null = tak terbatas), jendela `opensAt`/`closesAt` sendiri di dalam jendela global challenge.
Gerbang: `gateMode`, `minScore`, `maxAdvancing`, `scoreBasis`, `gateSourceIds String[]`, `pendingPolicy`, `graceDays`.

> `gateSourceIds` **menyimpan id, bukan urutan** — urutan bisa digeser perusahaan dan rujukan yang memakainya akan berubah arti tanpa suara. Karena itu jalur pembaruan wajib mempertahankan `ChallengeSection.id`.

### `StageAttempt` → `stage_attempts`
Satu baris per (pendaftaran, tahap). `status`, `startedAt` (dicap saat menekan "Mulai Tahap", bukan saat halaman termuat), `expiresAt` (**otoritas tunggal batas waktu**), `submittedAt`, `score` (0–100, tanpa komponen psikometrik), `gradedAt`, `unlockedAt`, `lockReason` (kalimat siap tampil), `approvedById`/`approvedAt`.
Kunci: `@@unique([enrollmentId, sectionId])`. Indeks: `[status, expiresAt]` (cron kedaluwarsa), `[sectionId, score desc]` (peringkat TOP_N).

### `ChallengeComponent` → `challenge_components`
Satu soal di dalam ujian: `type`, `question`, `description`, `options Json?` (pilihan ganda: `[{id, text, isCorrect}]`), `metadata Json?`, `points` (bawaan 10), `order`, `sectionId?`.
`sourceItemId` → `QuestionBankItem` (`SetNull`) **hanya jejak asal**; isi disalin saat dipungut. Indeks `[sourceItemId]`.

### `QuestionBankItem` → `question_bank_items`
`companyId` null = bank platform, terisi = koleksi pribadi. `type`, `question`, `description`, `options`, `metadata`, `defaultPoints` (usulan, boleh ditimpa tahapan), `categoryId` (null = lintas bidang), `difficulty`, `isActive`.
Indeks: `[companyId, categoryId, difficulty]`, `[isActive, categoryId]`.

### `QuestionBankItemSkill` → `question_bank_item_skills`
Tabel penghubung `@@id([itemId, skillId])`, indeks `[skillId]`.

### `ChallengeEnrollment` → `challenge_enrollments`
`status`, `ndaSignedAt`, `startedAt`, `completedAt`, `draftData Json?` (autosave server).
`@@unique([talentId, challengeId])`; indeks `[talentId, updatedAt desc]`, `[challengeId]`.

## 8. Tentang hasil — rincian teknis

### `Submission` → `submissions`
Relasi: `enrollment`, `talent`, `challenge`, `section?` (null = submisi seluruh challenge — bentuk lama yang tetap sah), `stageAttempt?` (unik).

| Kelompok | Kolom |
|---|---|
| Solusi | `solutionFilesUrl`, `repositoryUrl`, `figmaUrl`, `liveDemoUrl`, `notes` |
| AI | `aiPlagiarismScore`, `aiCorrectionSummary`, `aiScore` |
| Soft skill | `softSkillScore`, `softSkillFeedback` |
| Psikometrik | `psychometricProfile Json?` — `{ dimensions: [{ name, score, itemCount }], computedAt }`. **Sengaja terpisah** dari `aiScore`/`finalScore`: skala Likert tidak punya jawaban benar, memasukkannya mengubah ukuran "seberapa benar" jadi campuran yang tidak bisa ditafsirkan |
| Pengembangan karier | `weaknessTags String[]` |
| Keputusan | `finalScore`, `reviewerFeedback`, `status`, `hiringStatus`, `autoPassed`, `evaluatedAt` |
| Operasional | `slaReminderSentAt` |

Indeks: `[status, createdAt]` (cron AI tiap 30 detik — tanpa ini seluruh tabel dipindai dua kali per menit), `[challengeId, status]`, `[talentId]`, `[enrollmentId]`, `[sectionId]`.

### `ComponentResponse` → `component_responses`
`textValue` (esai/URL/live coding/id pilihan), `fileUrl` (berkas/video), `score`, `aiFeedback`.

### Tabel pendukung

| Model | Tabel | Isi utama |
|---|---|---|
| `Discussion` | `discussions` | Q&A per challenge, berulir lewat `parentId`. Indeks `[challengeId, createdAt]`, `[parentId]` |
| `Portfolio` | `portfolios` | 1-1 dengan `Submission` (`submissionId` unik); `isPublic`, `verifiedBadgeUrl`, `showcaseSummary` |
| `Badge` | `badges` | `title` unik, `criteria`, `threshold`, `param` (mis. `DIFFICULTY_PASSED` = "ADVANCED") |
| `TalentBadge` | `talent_badges` | `@@unique([talentId, badgeId])`, `earnedAt` |
| `Notification` | `notifications` | `title`, `content`, `isRead`, `linkUrl`. Indeks `[userId, isRead, createdAt desc]` |

## 9. Tentang uang dan operasional — rincian teknis

| Model | Tabel | Isi utama |
|---|---|---|
| `TokenTransaction` | `token_transactions` | `amount`, `type` (EARN/SPEND), `description`. Indeks `[userId, createdAt desc]` |
| `PaymentTransaction` | `payment_transactions` | `externalId` unik (Midtrans order_id), `checkoutUrl`, `amount`, `status`, `paymentType`, `metadata Json?`. Indeks `[userId, createdAt desc]`, `[status]` |
| `SystemAuditLog` | `system_audit_logs` | `action`, `entityType`, `entityId?`, `details Json?` |
| `SupportTicket` / `TicketReply` | `support_tickets` / `ticket_replies` | Tiket dan balasannya |
| `Announcement` | `announcements` | `type`, `isActive`, `expiresAt` |

## 10. Riwayat perubahan struktur

### Yang dipakai sekarang

| Migrasi | Isi |
|---|---|
| `0_init` | Dasar seluruh struktur, dibangkitkan dari `schema.prisma`; membangun **29 tabel** dari kosong |
| `20260731100000_drop_section_stage_type` | Membuang mode tahap yang tidak terpakai |
| `20260731140000_challenge_role_and_other_category` | Menambah `Challenge.role` dan kategori "lainnya" |
| `20260731170000_job_category_from_skill_directory` | Bidang pekerjaan pindah dari daftar tertutup ke relasi `Skill` |
| `20260801100000_challenge_takedown_soft_delete` | Kolom penurunan studi kasus |
| `20260803120000_badge_criteria` | `BadgeCriteria`, `threshold`, `param` pada `Badge` |

**Dua bagian `0_init` ditulis tangan** dan tidak akan muncul dari pembangkit otomatis:
1. `CREATE EXTENSION IF NOT EXISTS vector` — Prisma hanya menghasilkannya bila preview `postgresqlExtensions` aktif, dan itu tidak dipakai di sini.
2. Indeks **HNSW** pada `biometricFeatureVector` — Prisma tidak bisa mengindeks kolom `Unsupported`. Tanpa indeks itu, pencarian wajah serupa berubah jadi pemindaian seluruh tabel.

### Yang sudah dipensiunkan

13 migrasi lama di `prisma/migrations-archive/` — **tidak pernah bisa membangun basis data dari kosong**. Dasarnya dulu dibuat lewat `prisma db push`, sehingga sebagian tabel tidak punya migrasi sendiri sementara migrasi berikutnya tetap mengubahnya. Gagal di migrasi kedua dari tiga belas:

```
Applying migration `20260727120000_add_indexes_and_invite_code_expiry`
Error: P3018
ERROR: column "inviteCode" of relation "company_profiles" does not exist
```

Ukuran selisihnya: migrasi awal lama membuat 11 tabel, sedangkan skema mendefinisikan 29 model. Direktori arsip tetap disimpan karena memuat catatan keputusan atas data produksi. Prisma tidak membacanya.

### Keadaan produksi (diperiksa 2026-08-03)

- `prisma migrate status` → **5 migrations found, Database schema is up to date**; `0_init` tercatat sudah diterapkan.
- `prisma migrate diff --exit-code` → **exit 0, selisih kosong**.
- Penyebaran menjalankan `prisma migrate deploy`, **hanya di satu jalur** — dua jalur berbarengan terhadap basis data yang sama akan berebut satu tabel `_prisma_migrations`.

## 11. Data awal dan skrip pemeliharaan — rincian teknis

| Berkas | Isi |
|---|---|
| `prisma/seed.ts` (+ `seed.sql`, 101 KB) | Data demo utuh: pengguna, perusahaan, challenge, komponen, submisi, lencana |
| `prisma/seed-question-bank.ts` | Isi bank soal platform; `npm run seed:question-bank` |
| `src/seed/` | Endpoint `POST /api/v1/seed` — **menjalankan `TRUNCATE TABLE "users" CASCADE`** beserta `badges` dan `challenges` |

| Skrip | Perintah | Fungsi |
|---|---|---|
| `scripts/backfill-biometric-vectors.ts` | `npm run script:backfill-biometric-vectors` | Mengisi ulang embedding wajah untuk baris lama |
| `scripts/reencrypt-identity-data.ts` | `npm run script:reencrypt-identity-data` | Enkripsi ulang data identitas saat kunci dirotasi |
| `scripts/migrate-slugs.js` | `npm run script:migrate-slugs` | Mengisi `slug` profil talenta/perusahaan |

## 12. Catatan basis data uji

`scripts/setup-test-db.sh` membangun basis data uji dengan `prisma db push` atas **salinan skema tanpa kolom pgvector** — `0_init` memuat `CREATE EXTENSION vector` yang gagal pada PostgreSQL tanpa pgvector, termasuk mesin pemeriksa otomatis di CI.

Akibatnya yang wajib diingat: basis data uji **bukan tiruan persis produksi**. Yang hilang tepat satu kolom beserta indeksnya. **Pengujian yang menyentuh deteksi wajah kembar/duplikat tidak boleh bersandar padanya.** Skrip juga menolak berjalan bila host tujuannya bukan komputer lokal, karena `db push` menghapus dan membuat ulang tabel.
