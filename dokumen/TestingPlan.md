# Rencana Pengujian — Tolongin.co

**Dokumen**: TestingPlan · analisis 2026-08-06

> Istilah teknis dijelaskan di [glosarium](README.md#glosarium). Bagian berjudul **"— rincian teknis"** aman dilewati bila Anda tidak menulis kode.

---

## 1. Bagaimana kami tahu aplikasinya belum rusak

Setiap kali kode diubah, ada kemungkinan sesuatu yang tadinya jalan jadi rusak — sering di tempat yang tidak ada hubungannya dengan yang barusan disentuh. Pengujian otomatis adalah cara menangkapnya sebelum sampai ke pengguna.

Ibarat pemeriksaan mutu di pabrik, ada tiga tingkat:

| Tingkat | Yang diperiksa | Analogi | Jumlah | Kecepatan |
|---|---|---|---|---|
| **Uji satuan** | Satu aturan kecil, terpisah dari yang lain | Memeriksa satu baut | **252** | Detik |
| **Uji integrasi** | Beberapa bagian bekerja sama dengan gudang data sungguhan | Memeriksa satu rakitan | **10** | Puluhan detik |
| **Uji browser** | Membuka aplikasi sungguhan dan mengkliknya seperti pengguna | Mencoba produk jadi | **6** | Menit |

Bentuk piramida ini disengaja: banyak pemeriksaan kecil yang cepat, sedikit pemeriksaan besar yang lambat. Yang paling banyak diuji adalah **aturan yang menentukan boleh-tidaknya sesuatu** — kuota paket, syarat lolos tahap, hak akses perusahaan, perhitungan nilai. Di situlah kesalahan paling mahal.

Selain itu, dua pemeriksaan otomatis berjalan pada setiap perubahan, bahkan sebelum pengujian dimulai:

- **Pemeriksaan tipe** — memastikan data yang dioper antarbagian bentuknya cocok. Menangkap salah ketik dan ketidakcocokan sebelum aplikasi sempat dijalankan.
- **Pemeriksaan gaya** — menangkap pola berbahaya dan kode mati.

### Yang menjaga gerbang sebelum rilis

Setiap perubahan yang dikirim ke jalur utama **harus melewati enam langkah berurutan** sebelum boleh menyentuh server produksi: pasang dependensi → pemeriksaan tipe → pemeriksaan gaya → uji satuan → siapkan basis data uji → uji integrasi. Bila ada satu yang gagal, penyebaran dibatalkan.

Sebelum gerbang ini ada, perubahan langsung diterapkan ke server produksi tanpa satu pun pemeriksaan. Kesalahan yang tidak terlihat oleh pemeriksa tipe baru muncul saat server menyala — dan artinya seluruh layanan mati, diketahui setelah rilis.

### Tiga hal yang perlu Anda tahu tentang batas pengujian ini

1. **Aplikasi web belum diperiksa otomatis.** Uji browser dan uji logika sisi tampilan hanya berjalan di komputer pengembang, tidak di gerbang rilis. Ini celah terbesar saat ini.
2. **Pemeriksa wajah tidak punya pengujian otomatis sama sekali.** Padahal justru di sanalah selisih aman paling tipis.
3. **Persentase kode yang tersentuh pengujian tidak dilacak.** Tidak ada angka minimum yang harus dipenuhi, dan tidak ada laporan yang dikumpulkan dari rilis ke rilis.

Bagian [§8](#8-area-berisiko-yang-belum-tercakup) memuat daftar lengkap area berisiko beserta usulan penanganannya.

---

## 2. Rincian jumlah dan alat — rincian teknis

| Lapisan | Alat | Lokasi | Jumlah kasus |
|---|---|---|---|
| Unit backend | Jest 30 + ts-jest | `backend/src/**/*.spec.ts` | **224** di 24 berkas |
| Integrasi backend | Jest + Supertest, PostgreSQL nyata | `backend/test/*.e2e-spec.ts` | **10** di 1 berkas |
| Unit frontend | Vitest 4 (`environment: node`) | `frontend/**/*.test.ts` | **28** di 2 berkas |
| E2E browser | Playwright (chromium) | `frontend/e2e/*.spec.ts` | **6** di 4 berkas |
| Typecheck | `tsc --noEmit` | kedua repo | Gerbang wajib |
| Lint | ESLint 9 flat config | kedua repo | Gerbang wajib |

**Keputusan yang disengaja**: komponen React **tidak** diuji. Itu menuntut jsdom dan testing-library, sementara nilainya jauh lebih kecil daripada menguji aturan yang menggerbang seluruh alur (`frontend/vitest.config.ts`).

## 3. Cakupan uji satuan backend — rincian teknis

| Berkas | Kasus | Yang dijaga |
|---|---|---|
| `challenges/challenges.service.spec.ts` | 38 | Kuota paket, kuota Public Challenge, biaya token, validasi penerbitan, ruang lingkup pemilik |
| `stages/stage-gate.service.spec.ts` | 26 | Keempat mode gerbang, ketiga dasar nilai, ketiga kebijakan saat nilai belum siap |
| `question-bank/question-bank.service.spec.ts` | 20 | Ruang lingkup bank platform vs pribadi, penyaringan, penonaktifan soal |
| `skills/skills.service.spec.ts` | 20 | Resolusi keahlian/bidang, throttle AI, pencegahan duplikat kosakata |
| `admin/admin.service.spec.ts` | 19 | Ban, takedown/restore, tinjau identitas, audit |
| `badges/badges.service.spec.ts` | 15 | Sepuluh kriteria lencana dan ambangnya |
| `submissions/psychometric.spec.ts` | 14 | Normalisasi skala Likert, profil per dimensi, penolakan metadata cacat |
| `admin/admin.controller.spec.ts` | 12 | Guard dan bentuk respons endpoint admin |
| `challenges/stage-gate-validation.spec.ts` | 10 | Validasi konfigurasi gerbang saat disimpan |
| `submissions/submissions.grading.spec.ts` | 9 | Penilaian objektif, agregasi skor, pengecualian psikometrik |
| `support/support.service.spec.ts` | 9 | Kepemilikan tiket dan balasan |
| `challenges/absorb-questions.spec.ts` | 6 | Penyalinan soal dari bank (bukan perujukan) |
| `common/utils/company-scope.spec.ts` | 6 | `resolveCompanyScope` — pemilik vs anggota tim |
| `common/dev-flags.spec.ts` | 5 | Saklar batas langganan dan modul seeding |
| `seed/seed.controller.spec.ts` | 4 | Endpoint destruktif hanya untuk ADMIN |
| `submissions/submissions.cron.spec.ts` | 2 | Antrean evaluasi AI, pengingat SLA |
| `announcements/announcements.service.spec.ts` | 2 | Pengumuman aktif/kedaluwarsa |
| `app.module.spec.ts`, `app.module.production.spec.ts`, `auth/guards/guards-di.spec.ts` | 3 | **Perakitan container Nest** — menangkap kesalahan penyuntikan dependensi yang tidak terlihat `tsc`; varian produksi memastikan `SeedModule` tidak terdaftar |
| `tokens/*.spec.ts`, `skills/skills.controller.spec.ts`, `app.controller.spec.ts` | 3 | Kontrak dasar controller/service |

`app.module.spec.ts` layak disebut tersendiri: sebelum ada, kesalahan penyuntikan dependensi baru muncul saat Nest membangun container di produksi — seluruh API mati dan baru ketahuan setelah rilis. Sekarang tertangkap dalam hitungan detik.

## 4. Uji integrasi backend — rincian teknis

**Berkas**: `backend/test/stage-flow.e2e-spec.ts` (10 kasus) — alur tahap ujung ke ujung terhadap PostgreSQL sungguhan: mendaftar → mulai tahap → batas waktu → kumpulkan → gerbang → tahap berikutnya.

**Penyiapan basis data**: `backend/scripts/setup-test-db.sh`

- Membuat ulang basis data `tolongin_test`, lalu `prisma db push` atas **salinan skema tanpa kolom pgvector**.
- Alasan `db push` alih-alih `migrate deploy`: `0_init` memuat `CREATE EXTENSION vector` yang gagal pada PostgreSQL tanpa pgvector — termasuk runner CI dan kebanyakan mesin pengembang.
- **Konsekuensi yang wajib diingat**: basis data uji **bukan tiruan produksi**. Yang hilang tepat satu kolom beserta indeks HNSW-nya. **Pengujian yang menyentuh deduplikasi identitas biometrik tidak boleh bersandar padanya.**
- Penjagaan: skrip menolak berjalan bila `PGHOST` bukan localhost, dan `DIRECT_URL` ditimpa agar `prisma.config.ts` tidak memakai nilai `.env` yang menunjuk produksi.

## 5. Uji frontend — rincian teknis

### Vitest (logika murni)

| Berkas | Kasus | Yang dijaga |
|---|---|---|
| `app/(dashboard)/challenges/create/components/stepValidation.test.ts` | 19 | Gerbang tiap langkah builder challenge |
| `app/(dashboard)/challenges/create/components/bulkQuestions.test.ts` | 9 | Parser soal massal |

### Playwright (browser)

| Berkas | Kasus | Cakupan |
|---|---|---|
| `e2e/auth.spec.ts` | 2 | Alur login |
| `e2e/tests/onboarding.spec.ts` | 2 | Onboarding pengguna baru |
| `e2e/landing.spec.ts` | 1 | Halaman depan tampil |
| `e2e/backend-health.spec.ts` | 1 | Backend terjangkau dari frontend |

Konfigurasi: `baseURL http://localhost:3000`, `webServer: npm run dev` dengan `reuseExistingServer` di luar CI, `retries: 2` dan `workers: 1` di CI, trace `on-first-retry`, reporter HTML.

## 6. Gerbang otomatis — rincian teknis

### 6.1 Hook lokal (`backend/scripts/verify.ps1`)

Hook `Stop` yang terdaftar di `.claude/settings.json`. Menjalankan `tsc --noEmit` pada **setiap repo yang punya perubahan `.ts`/`.tsx` belum ter-commit**, dan memblokir penyelesaian pekerjaan (exit 2) bila gagal.

- Hasil lolos di-cache di `.claude/.verify-state.json` dengan sidik jari `path|LastWriteTimeUtc`; giliran bersih berbiaya di bawah satu detik.
- Memakai `tsc` lokal (`node_modules/.bin/tsc.cmd` atau `node_modules/typescript/bin/tsc`) — `npx tsc` mengambil paket lain yang tidak terpelihara dan gagal dengan "This is not the tsc command you are looking for".
- `-LiteralPath` wajib: rute dinamis Next.js mengandung kurung siku, dan tanpa itu berkas seperti `app\(dashboard)\support\[id]\page.tsx` selalu dinilai "deleted" sehingga cache tidak pernah batal dan `tsc` dilewati diam-diam.

> **Hook ini hanya memeriksa tipe.** Untuk perubahan logika, jalankan `npm test` sendiri — hook tidak melakukannya.

### 6.2 CI (`backend/.github/workflows/deploy.yml`, job `test`)

Berjalan pada push ke `main` **dan** pada pull request, dengan service PostgreSQL 16 (`POSTGRES_HOST_AUTH_METHOD: trust`). Urutan langkah:

1. `pnpm install --frozen-lockfile` (memicu `prisma generate` lewat postinstall)
2. `pnpm exec tsc -p tsconfig.build.json --noEmit`
3. `pnpm run lint`
4. `pnpm test`
5. `pnpm run test:e2e:setup`
6. `pnpm exec jest --config ./test/jest-e2e.json`

Job `deploy` bergantung pada `test` **dan** dipagari `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`. Tanpa pagar itu, membuka pull request akan men-deploy ke VPS produksi — secretnya tersedia karena cabangnya ada di repositori yang sama.

Uji sengaja dijalankan di runner, **bukan lewat SSH di VPS**: mesin produksi memegang `.env` produksi, dan menjalankan uji di sana menaruh kode uji satu langkah dari basis data sungguhan.

> **Repositori frontend belum punya alur CI.** Vitest dan Playwright saat ini hanya berjalan di mesin pengembang.

## 7. Perintah

Backend:

```bash
cd backend && npm test
```

```bash
cd backend && npm run test:cov
```

```bash
cd backend && npm run test:e2e:setup && npm run test:e2e:local
```

```bash
cd backend && npx tsc --noEmit -p tsconfig.json && npm run lint
```

Frontend:

```bash
cd frontend && npm test
```

```bash
cd frontend && npx playwright test
```

```bash
cd frontend && npx tsc --noEmit && npm run lint
```

Pemeriksaan sintaks worker Python:

```bash
backend/.venv-ml/Scripts/python.exe -m py_compile backend/src/ai/python/face_worker.py backend/src/ai/python/ocr_worker.py backend/src/ai/python/verify_face.py backend/src/ai/python/verify_ktp.py
```

## 8. Area berisiko yang belum tercakup

| Area | Risikonya apa | Usulan |
|---|---|---|
| Deteksi wajah duplikat | Tidak bisa diuji di basis data uji karena kolom vektornya dibuang | Job terpisah dengan image `pgvector/pgvector:pg16` dan migrasi penuh |
| Pemeriksa wajah dan KTP (Python) | Tidak ada uji otomatis sama sekali; hanya pemeriksaan sintaks manual | Uji kontrak stdio memakai gambar contoh di `backend/testing/` |
| Ambang kemiripan wajah | Selisih aman hanya ~0,075; naik versi pustaka ML menggesernya | Uji regresi ambang wajib dijalankan setiap kali versi ML dinaikkan |
| Webhook pembayaran | Tidak ada uji — dan ini jalur uang | Uji kontrak dengan payload contoh + verifikasi tanda tangan |
| Aplikasi web di CI | Uji frontend tidak berjalan otomatis | Tambahkan alur CI di repositori `frontend` |
| Batas paket langganan | Dimatikan selama pengembangan | Uji sudah menyalakan saklarnya per kasus; pastikan tetap begitu saat penegakan dinyalakan |
| Notifikasi langsung | Tidak ada uji koneksi/otorisasi | Uji integrasi socket: token valid, token kedaluwarsa, tanpa token |
| Komponen tampilan | Sengaja tidak diuji | Tetap; kompensasinya cakupan aturan di lapisan logika |

## 9. Definisi "selesai" untuk setiap perubahan

1. Pemeriksaan tipe hijau pada repo yang disentuh (dijaga hook otomatis).
2. Pemeriksaan gaya hijau.
3. `npm test` hijau untuk perubahan logika — hook **tidak** menjalankannya.
4. Uji integrasi dijalankan bila perubahan menyentuh alur tahap atau struktur basis data.
5. Bila struktur basis data berubah: migrasi dibuat, dan pembandingan terhadap basis data target menghasilkan selisih kosong.
6. Bila menyentuh tampilan: diverifikasi sendiri di preview — baca halaman, periksa konsol, ambil tangkapan layar — bukan diserahkan ke pengguna untuk dicek manual.
7. Dokumen di folder ini yang terdampak sudah diperbarui (lihat [aturan pemeliharaan](README.md#aturan-pemeliharaan-dokumen)).
