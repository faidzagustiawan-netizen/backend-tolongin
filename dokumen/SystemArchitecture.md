# Arsitektur Sistem — Tolongin.co

**Dokumen**: SystemArchitecture · analisis 2026-08-06

> Istilah teknis dijelaskan di [glosarium](README.md#glosarium). Bagian berjudul **"— rincian teknis"** aman dilewati bila Anda tidak menulis kode.

---

## 1. Gambaran umum: Tolongin sebagai sebuah kantor

Bayangkan Tolongin adalah kantor dengan beberapa ruangan:

| Bagian sistem | Perannya di kantor |
|---|---|
| **Aplikasi web** yang Anda buka di browser | **Ruang depan.** Etalase, formulir, tombol. Tidak menyimpan apa pun, tidak memutuskan apa pun — hanya menampilkan dan meneruskan. |
| **Server aplikasi** | **Ruang kerja.** Semua keputusan diambil di sini: siapa boleh apa, nilai berapa, tahap terbuka atau tidak. |
| **Basis data** | **Gudang arsip.** Menyimpan semua yang perlu diingat: akun, ujian, jawaban, nilai, transaksi. |
| **Pemeriksa wajah dan KTP** | **Laboratorium forensik** di ruang belakang. Bekerja lambat dan berat, jadi punya ruangan sendiri supaya tidak menghambat yang lain. |
| **Penjadwal otomatis** | **Alarm.** Berbunyi berkala untuk pekerjaan rutin: nilai jawaban yang antre, kunci ujian yang lewat waktu, ingatkan perusahaan yang lambat meninjau. |
| **Layanan luar** | **Vendor.** Pembayaran, pengiriman surel, penyimpanan berkas, model AI. Kantor menelepon mereka saat perlu. |

Aturan pentingnya: **ruang depan tidak pernah masuk gudang.** Browser tidak pernah menyentuh basis data langsung — semua lewat ruang kerja, yang memeriksa izin lebih dulu. Itu sebabnya memodifikasi tampilan di browser tidak bisa dipakai mencurangi nilai atau batas waktu.

### Peta sistem

```
                    ┌──────────────────────────────┐
   Browser ────────▶│ Aplikasi web (Next.js)       │ dijalankan di Vercel
   pengguna         │ "ruang depan"                │
                    └───────┬──────────────┬───────┘
                permintaan  │              │ saluran notifikasi langsung
                            ▼              ▼
                    ┌──────────────────────────────┐
                    │ Server aplikasi (NestJS)     │ dijalankan di VPS, port 3001
                    │ "ruang kerja"                │
                    │  · pemeriksa izin            │
                    │  · aturan bisnis             │
                    │  · alarm terjadwal           │
                    └───┬────────┬─────────┬───────┘
                        │        │         │
                        ▼        ▼         ▼
             ┌────────────────┐ ┌──────────────┐ ┌────────────────────┐
             │ Basis data     │ │ Pemeriksa    │ │ Layanan luar:      │
             │ "gudang arsip" │ │ wajah & KTP  │ │ AI · pembayaran ·  │
             │ (Supabase)     │ │ "lab"        │ │ surel · penyimpanan│
             └────────────────┘ └──────────────┘ └────────────────────┘
```

## 2. Dua alur terpenting

### 2.1 Perjalanan satu jawaban ujian

Dari kandidat menekan "Kumpulkan" sampai perusahaan melihat nilainya:

```
 1. Kandidat menekan "Mulai Tahap"
        │  server mencatat jam mulai dan menghitung jam berakhir
        ▼
 2. Kandidat mengerjakan
        │  jawaban tersimpan otomatis ke server selama mengerjakan
        ▼
 3. Kandidat menekan "Kumpulkan"
        │  server menolak bila sudah lewat jam berakhir
        ▼
 4. Soal pilihan ganda dinilai langsung          ──▶ nilai objektif siap
        │
        ▼
 5. Submisi masuk antrean "menunggu AI"
        │
        │  ⏰ alarm tiap 30 detik mengambil antrean
        ▼
 6. AI menilai esai, memeriksa plagiarisme, menilai soft skill
        │
        ▼
 7. Nilai tahap dihitung → syarat lolos tahap berikutnya diperiksa
        │
        ├──▶ lolos: tahap berikutnya terbuka, kandidat diberi tahu
        └──▶ belum: alasan terkuncinya disimpan sebagai kalimat siap tampil
        │
        ▼
 8. Perusahaan meninjau, memberi nilai akhir dan ulasan
        │  ⏰ bila lewat 7 hari, alarm harian mengingatkan — sekali saja per submisi
        ▼
 9. Lulus → kandidat bisa menjadikannya portofolio publik + XP + lencana
```

### 2.2 Perjalanan verifikasi identitas

```
 1. Kandidat mengunggah foto KTP + selfie
        │
        ▼
 2. Server menjawab "sedang diproses" dan MELEPAS kandidat
        │  (tidak menahan halaman; kandidat boleh menutup browser)
        ▼
 3. Di ruang belakang, dua pemeriksa bekerja:
        ├── pembaca tulisan  ──▶ ambil nama dan NIK dari foto KTP
        └── pembanding wajah ──▶ ubah wajah jadi deretan angka, bandingkan
        │
        ▼
 4. Wajah selfie dibandingkan dengan wajah di KTP
        │
        ├──▶ tidak mirip           : ditolak
        └──▶ mirip                 : lanjut
        │
        ▼
 5. Wajah dibandingkan dengan SEMUA akun yang sudah ada
        │
        ├──▶ sangat mirip akun lain : ditolak — satu orang satu akun
        ├──▶ mirip tapi belum pasti : masuk antrean pemeriksaan admin
        └──▶ tidak mirip siapa pun  : Terverifikasi
        │
        ▼
 6. Hasil dikirim ke browser kandidat lewat saluran notifikasi langsung
```

**Kenapa dilepas dan tidak ditunggu**: pemeriksaan wajah memakan waktu puluhan detik. Menahan halaman selama itu membuat aplikasi terasa menggantung dan permintaan sering putus di tengah jalan.

## 3. Bagian-bagian sistem — rincian teknis

### 3.1 Urutan penyalaan server (`backend/src/main.ts`)

1. Sentry dinyalakan (`SENTRY_DSN`, sampling trace & profil 1.0).
2. `helmet()` — header keamanan HTTP.
3. CORS allowlist: `https://tolongin.co`, `https://frontend-tolongin.vercel.app`, `http://localhost:3000`, `https://podorukunspk.fun`, `https://api.podorukunspk.fun`, `credentials: true`.
4. Prefix global `api/v1`, **kecuali** `GET /health`.
5. Batas body JSON dan urlencoded 5 MB.
6. `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })` — properti tak dikenal **ditolak**, bukan diabaikan.
7. `GlobalExceptionFilter`, `LoggingInterceptor`, `SentryInterceptor`.
8. Swagger di `/api/docs` — **hanya bila `NODE_ENV !== 'production'`**.
9. Listen di `PORT` (bawaan 3001).

### 3.2 Peta modul (`backend/src/app.module.ts`)

26 modul fitur:

| Kelompok | Modul |
|---|---|
| Infrastruktur | `PrismaModule` (global), `HealthModule`, `MailModule`, `StorageModule`, `AiModule` |
| Identitas & akses | `AuthModule`, `UsersModule`, `VerificationModule`, `CompaniesModule` |
| Inti produk | `ChallengesModule`, `QuestionBankModule`, `StagesModule`, `SubmissionsModule`, `PortfoliosModule`, `DiscussionsModule` |
| Ekonomi | `SubscriptionsModule`, `PaymentsModule`, `TokensModule` |
| Operasional | `AdminModule`, `SupportModule`, `AnnouncementsModule`, `NotificationsModule`, `SkillsModule`, `BadgesModule` |
| Kondisional | `SeedModule` — hanya terdaftar bila `seedModuleEnabled()` benar |

Modul lintas fungsi: `ConfigModule.forRoot({ isGlobal: true })`, `ScheduleModule.forRoot()`, `ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])`.

### 3.3 Lapisan pemeriksa dan pencatat

| Komponen | Berkas | Fungsi |
|---|---|---|
| `UserThrottlerGuard` | `common/guards/user-throttler.guard.ts` | `APP_GUARD` global. Kuota **per pengguna**, bukan per IP — endpoint mahal (generator AI) tidak dibagi rata satu alamat. Tamu tetap per IP |
| `JwtAuthGuard` / `OptionalJwtAuthGuard` | `auth/guards/` | Verifikasi JWT. Varian opsional dipakai direktori publik agar konten personal tetap muncul untuk yang login |
| `RolesGuard` + `@Roles()` | `auth/` | Kontrol akses berbasis peran |
| `VerifiedCompanyGuard` | `submissions/` | Menahan aksi rekrutmen sampai KYB lolos |
| `CompanyOwnerGuard` | `companies/` | Memisahkan pemilik dari anggota tim |
| `GlobalExceptionFilter` | `common/filters/` | Menyeragamkan galat; memetakan Prisma `P2002` ke HTTP 409 |
| `LoggingInterceptor`, `SentryInterceptor` | `common/interceptors/` | Log permintaan dan pelaporan galat |
| `resolveCompanyScope` | `common/utils/company-scope.ts` | Menentukan perusahaan efektif dari token — pencegah kebocoran lintas penyewa |

### 3.4 Akses data

- `PrismaService` adalah simpul dengan keterkaitan terbanyak di seluruh proyek (106 sisi) — satu-satunya pintu ke basis data bagi hampir semua service.
- Prisma 7 dengan driver adapter `@prisma/adapter-pg` di atas `pg`.
- Koneksi runtime memakai `DATABASE_URL` (pooler pgbouncer, port 6543). Migrasi **wajib** lewat `DIRECT_URL` (port 5432) — pooler mematahkan `prisma migrate`.
- `biometricFeatureVector` bertipe `Unsupported("vector(512)")`; seluruh aksesnya lewat `$queryRaw` di `IdentityDedupeService` sehingga tidak mungkin ikut terbawa ke respons API.

### 3.5 Lapisan AI

Dua jalur terpisah dalam `AiModule`.

**a. Model bahasa (`AiService`)** — klien SDK `openai` menunjuk basis URL yang bisa dikonfigurasi.
- Bawaan: `AI_BASE_URL = https://ai.sumopod.com/v1`, `AI_MODEL = gpt-4o`, kunci dari `OPENAI_API_KEY`.
- Kemampuan: `evaluateHolistic`, `evaluateComponents`, `generateChallengeBlueprint`, `generateChallengeContent`, `resolveDirectoryEntry`.

**b. Mesin biometrik (`PythonWorkerService` + `WorkerPool`)** — proses Python berumur panjang, berkomunikasi lewat stdio JSON baris-per-baris.
- Skrip: `src/ai/python/face_worker.py` (DeepFace/TensorFlow), `ocr_worker.py` (EasyOCR/PyTorch), plus `verify_face.py` dan `verify_ktp.py`.
- **Pool dipisah per skrip dengan sengaja**: EasyOCR berjalan di PyTorch dan DeepFace di TensorFlow; keduanya membawa runtime OpenMP/MKL sendiri, dan memuatnya dalam satu proses membuat proses itu mati `SIGSEGV` di tengah permintaan.
- Model dimuat sekali saat warmup, bukan per permintaan. Timeout bawaan 120 detik; restart otomatis maksimum 10 kali dengan jeda bertambah.
- Interpreter ditunjuk `PYTHON_BIN` (`.venv-ml`). Ukuran pool: `FACE_WORKER_POOL_SIZE`, `OCR_WORKER_POOL_SIZE`.
- `FaceEngineUnavailableError` bertipe sendiri agar kegagalan konfigurasi server menghasilkan "coba lagi nanti", bukan "wajah Anda tidak cocok".

### 3.6 Pekerjaan terjadwal

| Cron | Interval | Tugas |
|---|---|---|
| `SubmissionsCronService.handleAiEvaluations` | 30 detik | Ambil submisi `PENDING_AI` (indeks `[status, createdAt]`), jalankan evaluasi AI. Dijaga flag `isProcessing` agar tidak tumpang tindih |
| `SubmissionsCronService.handleReviewSlaReminders` | Harian 09:00 | Ingatkan perusahaan atas submisi melewati SLA 7 hari; `slaReminderSentAt` mencegah pengulangan |
| `StagesCronService.expireOverdueStages` | 1 menit | Tandai `StageAttempt` yang melewati `expiresAt` menjadi `EXPIRED` |
| `StagesCronService.releaseStagesWaitingOnGrading` | 1 jam | Buka tahap berkebijakan `AUTO_ADVANCE_AFTER` setelah `graceDays` |
| `StagesCronService.applyStageQuotas` | 30 menit | Terapkan gerbang `TOP_N` (indeks `[sectionId, score desc]`) |
| `SubscriptionsCronService.downgradeExpiredSubscriptions` | 1 jam | Turunkan paket yang `subscriptionExpiresAt` terlewat |

### 3.7 Notifikasi langsung

`NotificationsGateway` (socket.io) memverifikasi JWT dari `handshake.auth.token` atau header `Authorization`; koneksi tanpa token valid langsung diputus. Setiap pengguna masuk room `user_<userId>`; peta `userId → socketIds[]` menampung banyak tab sekaligus. Dipakai untuk hasil KYC latar belakang, notifikasi baru, dan pembaruan status submisi.

### 3.8 Integrasi luar

| Layanan | Pemakaian | Pengaturan |
|---|---|---|
| Cloudflare R2 | Unggahan berkas/video kandidat, dokumen legalitas | `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET_NAME`, `STORAGE_PUBLIC_URL` — **tanpa nilai bawaan**; service melempar galat saat start bila ada yang kosong |
| Midtrans | Top-up token, langganan, webhook | `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION` |
| Resend | Surel transaksional | `RESEND_API_KEY` |
| Sentry | Galat + profiling | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` |
| Penyedia LLM | Evaluasi & generator | `OPENAI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` |

## 4. Aplikasi web — rincian teknis

### 4.1 Struktur

```
app/
  (auth)/        login · register · forgot-password · reset-password
  (dashboard)/   admin/* · challenges/* · company/* · settings/* · support/* · talent/tokens
                 workspace/[enrollmentId] (+ /session) · notifications
  challenges/    direktori publik + [slug]
  companies/     direktori + [slug]
  talents/       direktori + [slug]
  leaderboard/ · privacy/ · terms/ · layout.tsx · page.tsx
components/      animations · challenge · common · company · landing · leaderboard
                 profile · providers · question-types · workspace   (72 komponen .tsx)
services/        18 modul pemanggil API (axios)
lib/             apiConfig · authStorage · challengeDraftStorage · hiringStatus
                 learning-taxonomy · midtrans · plans
store/           userStore.ts (Zustand)
hooks/           useAdminGuard · useStageGate
contexts/        SocketContext.tsx
types/ · utils/ · e2e/
```

64 berkas `.tsx` di `app/`, 47 rute.

### 4.2 Pola kunci

- **`useUserStore` (Zustand)** — simpul dengan keterkaitan terbanyak kedua di proyek (89 sisi): sesi, peran, dan penanda `isCompanyOwner` dibaca hampir seluruh halaman. Sesi dipertahankan lewat `lib/authStorage.ts`.
- **`AuthGuard`** global mencegat rute non-publik dan membawa alamat tujuan sebagai `?redirect=` (hanya lintasan internal, agar halaman masuk tidak menjadi pengalih terbuka). Daftar publiknya mencakup seluruh etalase — direktori studi kasus, direktori talenta, profil perusahaan, papan peringkat, halaman hukum, dan alur pemulihan kata sandi — dengan halaman rincian dicocokkan tepat satu ruas sesudah awalan, sehingga `/challenges/create`, `/challenges/mine`, dan `/challenges/<slug>/edit` tetap tertutup. `useAdminGuard` memulangkan non-admin dari panel admin, dan tata letaknya menampilkan alasan alih-alih layar kosong.
- **`components/admin/AdminActionDialog.tsx`** — satu-satunya jalan konfirmasi untuk keputusan admin yang berisiko. Mendukung mode konfirmasi biasa dan mode beralasan (pengganti `prompt()`), lengkap dengan panjang minimum yang ditegakkan sebelum permintaan dikirim. Di baliknya `Modal` + `useDialogA11y`.
- **`services/api.ts` (`apiClient`)** — satu instance axios yang menyisipkan bearer token; seluruh modul service memakainya.
- **`useStageGate`** memakai keputusan gerbang dari server; browser tidak menghitung ulang aturan.
- **Dua jenis draf**: `lib/challengeDraftStorage.ts` (localStorage, builder challenge) dan autosave ke server untuk pengerjaan kandidat.
- **`lib/plans.ts`** sumber tunggal definisi paket, disandingkan dengan `SUBSCRIPTION_MONTHLY_PRICE` dan `assertCompanyQuota` di backend.
- React Query untuk cache data server · react-hook-form + zod untuk formulir · framer-motion untuk animasi · Monaco untuk soal live coding · recharts untuk grafik admin.

### 4.3 Konfigurasi Next (`frontend/next.config.ts`)

- `images.remotePatterns` berisi allowlist eksplisit (storage host, `**.r2.cloudflarestorage.com`, dicebear, placehold, avatar pihak ketiga) plus tambahan lewat `NEXT_PUBLIC_EXTRA_IMAGE_HOSTS`. Pola bebas `**` sebelumnya membuat aplikasi menjadi proxy gambar terbuka: siapa pun bisa memaksa server kita mengambil alamat mana pun, termasuk alamat internal.
- `dangerouslyAllowSVG: true` diimbangi `contentSecurityPolicy: script-src 'none'; sandbox`.
- `rewrites()` mem-proxy `/api/:path*` ke `BACKEND_ORIGIN` (bawaan `http://localhost:3001`).
- `optimizePackageImports` untuk `lucide-react`, `framer-motion`, `@vladmandic/face-api`.

## 5. Kondisi struktural kode — rincian teknis

Dari pemindaian `graphify` pada 2026-08-03: **396 berkas · 2.371 simpul · 4.848 keterkaitan · 210 kelompok**, seluruhnya diekstraksi dari struktur kode (bukan tebakan).

- **Simpul paling terhubung**: `PrismaService` (106), `useUserStore` (89), `Button` (52), `Roles()` (51), `ChallengesService` (41), `StageGateService` (38), `NotificationsService` (32), `AdminController` (30), `AdminService` (30), `AiService` (28).
- **Tidak ada ketergantungan melingkar** — pertanda struktur modul masih sehat.
- Tiga berkas terbesar sekaligus kandidat utama pemecahan modul: `SubmissionsService` (~45 KB), `ChallengesService` (~45 KB), `StageGateService` (~37 KB). Kelompok `AdminController` juga berkohesi rendah (0,06).

## 6. Tujuh keputusan yang perlu diketahui sebelum mengubah apa pun

Masing-masing lahir dari masalah nyata. Membalikkannya berarti menghidupkan kembali masalahnya.

1. **Pemeriksa wajah dan pembaca KTP dijalankan di proses terpisah** — disatukan berarti proses mati mendadak di tengah permintaan.
2. **Data wajah disimpan dengan tipe yang tidak dikenali penerjemah basis data** — membuat kebocorannya lewat API mustahil secara struktural, bukan sekadar dilarang aturan.
3. **Keputusan buka-tutup tahap diambil server**, lengkap dengan alasannya dalam bentuk kalimat siap tampil — browser tidak perlu, dan tidak boleh, menghitung ulang aturannya.
4. **Soal dari bank disalin, bukan dirujuk** — menyunting bank soal tidak boleh mengubah ujian yang sedang dikerjakan orang.
5. **Penurunan studi kasus menandai, bukan menghapus** — cara lama menghapus berantai sampai ke portofolio kandidat yang tidak bersalah.
6. **Perintah pengisi data contoh dijaga dua lapis** — perintah itu mengosongkan tabel; satu lapis tidak cukup.
7. **Bidang pekerjaan diambil dari daftar keahlian yang sama** dengan yang dipakai kandidat — supaya bidang baru tidak menuntut perubahan struktur basis data, dan supaya yang dicari perusahaan benar-benar cocok dengan yang ditulis kandidat.
