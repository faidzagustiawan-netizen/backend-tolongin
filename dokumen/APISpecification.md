# Spesifikasi API — Tolongin.co

**Dokumen**: APISpecification · analisis 2026-08-06
**Sumber paling sahih saat aplikasi berjalan**: Swagger di `GET /api/docs` (**hanya aktif di luar produksi**)

> Istilah teknis dijelaskan di [glosarium](README.md#glosarium). Bagian berjudul **"— rincian teknis"** aman dilewati bila Anda tidak menulis kode.

---

## 1. API itu apa, dalam konteks Tolongin

Aplikasi yang Anda buka di browser tidak menyimpan atau memutuskan apa pun. Setiap kali Anda menekan tombol, ia **meminta** sesuatu kepada server: "ambilkan daftar studi kasus", "simpan jawaban ini", "beri nilai 85 untuk submisi ini".

API adalah **daftar permintaan yang boleh diajukan**. Ibarat menu restoran:

- Hanya yang tercantum di menu bisa dipesan. Permintaan yang tidak ada di daftar langsung ditolak.
- Sebagian menu hanya untuk tamu tertentu. Perintah admin tidak akan dilayani untuk akun kandidat, sekalipun permintaannya disusun rapi.
- Pelayan memeriksa kartu tamu Anda tiap kali memesan. Kartu itu adalah **token**, didapat saat login, dan ada masa berlakunya.

Ada sekitar **90 permintaan** di daftar ini, dikelompokkan menurut urusannya. Aturan penting: **pemeriksaan izin selalu terjadi di server**. Menyembunyikan tombol di layar bukan pengamanan — pengamanannya ada di sini.

## 2. Aturan yang berlaku untuk semua permintaan

| Aspek | Ketentuan |
|---|---|
| Alamat | `https://<host>/api/v1` — kecuali pemeriksaan kesehatan server (`/health`) yang di luar itu |
| Kartu tamu | Header `Authorization: Bearer <token>` |
| Format | JSON, maksimum 5 MB. Unggahan berkas memakai jalur khusus |
| Kedisiplinan isian | Isian yang tidak dikenal **ditolak**, bukan diabaikan diam-diam — mencegah data liar masuk |
| Batas frekuensi | 100 permintaan per menit per orang |
| Bahasa pesan | Indonesia |

### Bentuk jawaban saat gagal

Semua kegagalan berbentuk sama, jadi aplikasi bisa menanganinya seragam:

```json
{
  "success": false,
  "timestamp": "2026-08-06T10:00:00.000Z",
  "path": "/api/v1/challenges",
  "errorCode": "FORBIDDEN",
  "message": "Perusahaan Anda belum terverifikasi."
}
```

| Arti kode | Kapan muncul |
|---|---|
| `400` | Isian tidak lengkap atau tidak sesuai bentuk |
| `401` | Belum login, atau token kedaluwarsa |
| `403` | Sudah login tapi tidak berhak melakukannya |
| `404` | Yang diminta tidak ada |
| `409` | Bentrok data — mis. email atau nomor KTP sudah terpakai |
| `500` | Kesalahan di sisi server |

## 3. Contoh tujuh alur inti

Contoh di bawah **disederhanakan** — hanya isian yang penting ditampilkan. Bentuk pastinya selalu lihat Swagger.

### 3.1 Login

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "budi@contoh.com", "password": "••••••••" }
```

Jawaban:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "8f3c…", "email": "budi@contoh.com", "fullName": "Budi",
    "role": "TALENT", "isVerified": true, "isCompanyOwner": false,
    "profile": { "id": "…", "slug": "budi-x9k2", "headline": "Backend Engineer" }
  }
}
```

`accessToken` disertakan di setiap permintaan berikutnya sebagai `Authorization: Bearer …`.

### 3.2 Mengirim identitas untuk diverifikasi

Foto diunggah lebih dulu lewat jalur penyimpanan (§10), lalu **tautannya** yang dikirim:

```http
POST /api/v1/verification/face-ai
Authorization: Bearer <token>

{
  "selfiePhotoUrl": "https://storage.tolongin.co/uploads/1754-selfie.jpg",
  "idCardPhotoUrl": "https://storage.tolongin.co/uploads/1754-ktp.jpg"
}
```

Jawaban **202** — artinya "diterima, sedang diproses". Hasilnya menyusul lewat notifikasi langsung, bukan di jawaban ini.

### 3.3 Perusahaan mengirim dokumen legalitas

```http
POST /api/v1/verification/kyb
Authorization: Bearer <token>

{
  "businessRegistrationNumber": "12.345.678.9-012.000",
  "documentUrl": "https://storage.tolongin.co/docs/nib.pdf",
  "legalEntityName": "PT Teknologi Tolongin Indonesia"
}
```

### 3.4 Kandidat mendaftar ke studi kasus

```http
POST /api/v1/workspace/enroll
Authorization: Bearer <token>

{ "challengeId": "c1a9…" }
```

### 3.5 Memulai satu tahap

```http
POST /api/v1/stages/enrollment/e77b…/s02c…/start
Authorization: Bearer <token>
```

Sejak permintaan ini, server mencatat jam mulai dan menghitung jam berakhir. Jam di komputer kandidat tidak berpengaruh.

### 3.6 Mengumpulkan jawaban

```http
POST /api/v1/workspace/submit
Authorization: Bearer <token>

{
  "enrollmentId": "e77b…",
  "sectionId": "s02c…",
  "notes": "Asumsi: data transaksi dianggap sudah bersih.",
  "repositoryUrl": "https://github.com/budi/studi-kasus",
  "responses": [
    { "componentId": "q1", "textValue": "opt-b" },
    { "componentId": "q2", "textValue": "Menurut saya bottleneck-nya ada di…" },
    { "componentId": "q3", "fileUrl": "https://storage.tolongin.co/uploads/1754-desain.pdf" }
  ]
}
```

`sectionId` boleh dikosongkan untuk studi kasus tanpa tahapan — bentuk lama yang tetap didukung.

### 3.7 Perusahaan memberi nilai akhir

```http
PUT /api/v1/workspace/grade/sub-4412
Authorization: Bearer <token>

{
  "finalScore": 87,
  "reviewerFeedback": "Solusinya rapi, dokumentasi asumsinya jelas.",
  "status": "PASSED",
  "hiringStatus": "SHORTLISTED"
}
```

`finalScore` wajib antara 0 dan 100 — di luar itu ditolak sebelum menyentuh basis data.

---

## 4. Cara membaca tabel endpoint — rincian teknis

- 🔓 publik · 🔑 perlu JWT · 🔓🔑 JWT opsional (isi menyesuaikan bila login)
- Peran: `TALENT`, `COMPANY`, `ADMIN`
- `+KYB` = `VerifiedCompanyGuard` · `+OWNER` = `CompanyOwnerGuard`

### Payload JWT

```json
{
  "sub": "<userId>", "email": "…", "role": "TALENT|COMPANY|ADMIN",
  "isVerified": true, "fullName": "…", "profileId": "…",
  "companyId": "…", "isTeamMember": false, "isCompanyOwner": true
}
```

### Pemetaan galat internal

| Sumber | Status | `errorCode` |
|---|---|---|
| `HttpException` | status aslinya | `error` dari respons, atau nama status |
| Prisma `P2002` (duplikasi unik) | **409** | `PRISMA_DB_ERROR_P2002` |
| `PrismaClientKnownRequestError` lain | 400 | `PRISMA_DB_ERROR_<kode>` |
| `PrismaClientValidationError` | 400 | `PRISMA_VALIDATION_ERROR` |
| Galat tak terduga | 500 | `INTERNAL_SERVER_ERROR` |

## 5. Sistem

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/v1/` | 🔓 | Ping aplikasi |
| GET | `/health` | 🔓 | Pemeriksaan kesehatan (Terminus) — **tanpa prefix `/api/v1`** |
| GET | `/api/docs` | 🔓 | Swagger UI (non-produksi saja) |

## 6. Autentikasi — `/auth`

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| POST | `/auth/register` | 🔓 | Daftar akun Talenta atau Perusahaan (`CreateUserDto`) |
| POST | `/auth/register-team` | 🔓 | Daftar sebagai anggota tim, memakai `inviteCode` |
| POST | `/auth/login` | 🔓 | Login. HTTP **200** |
| POST | `/auth/forgot-password` | 🔓 | Kirim tautan pemulihan. HTTP 200 |
| POST | `/auth/reset-password` | 🔓 | Tukar token dengan kata sandi baru. HTTP 200 |

## 7. Pengguna, profil, direktori publik

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/users/:id` | 🔑 | Detail pengguna |
| PATCH | `/users/me/profile` | 🔑 | Perbarui profil sendiri |
| GET | `/portfolios` | 🔓 | Direktori portofolio publik |
| GET | `/talents` | 🔓 | Direktori talenta |
| GET | `/leaderboard` | 🔓 | Papan peringkat (penyaringan dilakukan server) |

## 8. Verifikasi identitas — `/verification`

Seluruhnya 🔑 + `RolesGuard`.

| Method | Path | Peran | Keterangan |
|---|---|---|---|
| POST | `/verification/face-ai` | TALENT | Kirim tautan foto KTP + selfie. Diproses latar belakang → **HTTP 202** |
| POST | `/verification/kyb` | COMPANY, ADMIN **+OWNER** | Ajukan dokumen legalitas usaha |
| POST | `/verification/verify-execution` | TALENT | Pencocokan wajah saat ujian (anti-joki) |
| GET | `/verification/status` | 🔑 | Status verifikasi pengguna saat ini |

## 9. Studi kasus, bank soal, tahapan, pengerjaan

### `/challenges`

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/challenges` | 🔓🔑 | Direktori; saring kategori/kesulitan/penerbit, paginasi |
| GET | `/challenges/:slugOrId` | 🔓🔑 | Detail; menerima slug maupun UUID |
| POST | `/challenges` | 🔑 COMPANY, ADMIN, TALENT **+KYB** | Buat. Talenta membuat Public Challenge: **-50 token**, maks. 3 aktif/draf |
| PATCH | `/challenges/:id` | idem | Sunting; wajib mempertahankan `ChallengeSection.id` |
| PATCH | `/challenges/:id/archive` | idem | Arsipkan (status `CLOSED`) |
| PATCH | `/challenges/:id/stages/:sectionId/gate` | idem | Atur syarat lolos tahap |
| POST | `/challenges/ai-generate-blueprint` | idem | Langkah 1 — kerangka yang bisa disunting |
| POST | `/challenges/ai-generate` | idem | Langkah 2 — isi lengkap |

### `/question-bank` — 🔑 COMPANY, ADMIN, TALENT

| Method | Path | Peran | Keterangan |
|---|---|---|---|
| GET | `/question-bank` | semua di atas | Cari soal (scope platform/pribadi, kategori, kesulitan, tipe, tag) |
| GET | `/question-bank/tags` | semua di atas | Daftar tag terpakai |
| GET | `/question-bank/:id` | semua di atas | Rincian satu soal |
| POST | `/question-bank` | COMPANY, ADMIN | Tambah soal ke koleksi |
| PATCH | `/question-bank/:id` | COMPANY, ADMIN | Perbarui soal milik sendiri |
| DELETE | `/question-bank/:id` | COMPANY, ADMIN | Nonaktifkan (`isActive=false`), bukan hapus |

### `/stages` — 🔑 + `RolesGuard`

| Method | Path | Peran | Keterangan |
|---|---|---|---|
| GET | `/stages/enrollment/:enrollmentId` | TALENT | Peta tahap + status kunci + alasan terkuncinya |
| POST | `/stages/enrollment/:enrollmentId/:sectionId/start` | TALENT | Mulai tahap; server mencatat jam mulai dan jam berakhir |
| GET | `/stages/challenge/:challengeId/approvals` | COMPANY, TALENT, ADMIN | Antrean persetujuan manual |
| POST | `/stages/attempt/:attemptId/approve` | COMPANY, TALENT, ADMIN | Loloskan kandidat |

### `/workspace` — 🔑 + `RolesGuard` + `VerifiedCompanyGuard`

| Method | Path | Peran | Keterangan |
|---|---|---|---|
| POST | `/workspace/enroll` | TALENT | Daftar ke challenge |
| GET | `/workspace/my-enrollments` | TALENT | Daftar pendaftaran sendiri |
| PUT | `/workspace/draft/:enrollmentId` | TALENT | Autosave draf ke server |
| POST | `/workspace/submit` | TALENT | Kumpulkan solusi |
| GET | `/workspace/company-submissions` | COMPANY, ADMIN | Daftar submisi masuk |
| GET | `/workspace/company-submissions/:id` | COMPANY, ADMIN | Detail submisi + jawaban per soal |
| GET | `/workspace/challenge-stats` | COMPANY, ADMIN | Statistik per studi kasus |
| PUT | `/workspace/grade/:id` | COMPANY, ADMIN, TALENT | Nilai manual |
| PATCH | `/workspace/submissions/:id/hiring-status` | COMPANY, ADMIN, TALENT | Ubah status rekrutmen |

## 10. Perusahaan, keahlian, penyimpanan

### `/companies`

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/companies` | 🔓 | Direktori (urut skor kepercayaan menurun) |
| GET | `/companies/:id` | 🔓 | Profil + studi kasus publiknya. Kolom internal seperti rubrik penilaian tidak ikut |
| GET | `/companies/workspace/team` | 🔑 COMPANY, ADMIN **+KYB +OWNER** | Daftar anggota tim |
| PATCH | `/companies/workspace/team/:memberId/status` | idem | Setujui/tolak anggota |
| POST | `/companies/workspace/invite-code` | idem | Terbitkan kode undangan sekali pakai |
| GET | `/companies/workspace/logs` | idem | Log aktivitas internal |

### `/skills` — seluruhnya 🔑

| Method | Path | Keterangan |
|---|---|---|
| GET | `/skills` | Cari keahlian |
| GET | `/skills/categories` | Daftar bidang pekerjaan (dari tabel yang sama) |
| POST | `/skills/resolve` | Tambah keahlian baru lewat pemeriksaan AI — membedakan salah ketik dari yang memang baru |
| POST | `/skills/categories/resolve` | Sama untuk bidang pekerjaan; satu-satunya gerbang tulis ke direktori |

### `/storage` — seluruhnya 🔑

| Method | Path | Keterangan |
|---|---|---|
| GET | `/storage/presigned-url` | Minta tautan unggah sementara; berkas dikirim langsung ke penyimpanan awan tanpa melewati server aplikasi |
| POST | `/storage/upload` | Unggah lewat server (multipart) |

## 11. Diskusi, notifikasi, bantuan, pengumuman

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/challenges/:challengeId/discussions` | 🔓 | Utas diskusi (berulir) |
| POST | `/challenges/:challengeId/discussions` | 🔑 **+KYB** | Kirim pesan/balasan |
| GET | `/notifications` | 🔑 | Daftar notifikasi |
| PATCH | `/notifications/:id/read` | 🔑 | Tandai satu terbaca |
| PATCH | `/notifications/read-all` | 🔑 | Tandai semua terbaca |
| POST | `/support/tickets` | 🔑 | Buat tiket bantuan |
| GET | `/support/tickets` | 🔑 | Tiket milik sendiri |
| GET | `/support/tickets/:id` | 🔑 | Satu tiket + balasannya |
| POST | `/support/tickets/:id/replies` | 🔑 | Balas tiket sendiri |
| GET | `/announcements` | 🔓 | Pengumuman aktif |

## 12. Ekonomi — `/tokens`, `/payments`, `/subscriptions`

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/tokens/balance` | 🔑 TALENT | Saldo token |
| GET | `/tokens/history` | 🔑 TALENT | Riwayat transaksi token |
| POST | `/tokens/topup` | 🔑 TALENT | **Simulasi** — saldo bertambah tanpa pembayaran nyata |
| POST | `/payments/topup` | 🔑 TALENT | Top-up lewat Midtrans → mengembalikan tautan pembayaran |
| POST | `/payments/subscribe` | 🔑 COMPANY **+OWNER** | Beli langganan: `tier` STARTUP/KONGLOMERAT, `durationMonths` 1–12 |
| POST | `/payments/webhook` | 🔓 (sistem) | Callback Midtrans. Wajib menjawab **200** |
| GET | `/subscriptions/status` | 🔑 COMPANY, ADMIN **+OWNER** | Paket aktif dan masa berlakunya |
| POST | `/subscriptions/upgrade` | 🔑 ADMIN | Naikkan paket secara manual |

Harga yang ditegakkan server: `STARTUP` Rp 500.000/bulan · `KONGLOMERAT` Rp 2.500.000/bulan. `CUSTOM` tidak tersedia lewat checkout mandiri.

## 13. Administrasi — `/admin`

Seluruhnya 🔑 + `RolesGuard` + `@Roles(ADMIN)`.

| Method | Path | Keterangan |
|---|---|---|
| GET | `/admin/stats` | Ringkasan platform |
| GET | `/admin/companies/pending` | Antrean perusahaan menunggu persetujuan |
| POST | `/admin/companies/:id/verify` | Tuntaskan tinjauan legalitas |
| GET | `/admin/users` | Daftar pengguna |
| PATCH | `/admin/users/:id/ban` | Ban / cabut ban |
| POST | `/admin/users/:id/warning` | Kirim peringatan |
| GET | `/admin/identity-reviews` | Antrean identitas meragukan |
| POST | `/admin/identity-reviews/:talentId` | Putuskan hasil tinjauan |
| GET | `/admin/challenges` | Daftar studi kasus untuk moderasi |
| POST | `/admin/challenges/:id/takedown` | Turunkan (menandai, tidak menghapus karya kandidat) |
| POST | `/admin/challenges/:id/restore` | Cabut penurunan |
| GET | `/admin/analytics` | Analitik |
| GET | `/admin/billing` | Ringkasan penagihan |
| GET | `/admin/audit-logs` | Log audit sistem |
| GET · POST · DELETE | `/admin/announcements[/:id]` | Kelola pengumuman |
| GET | `/admin/tickets` | Seluruh tiket |
| GET · POST | `/admin/tickets/:id/replies` | Baca dan balas tiket |
| PATCH | `/admin/tickets/:id/close` | Tutup tiket |

## 14. Pengisi data contoh — `/seed`

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| POST | `/seed` | 🔑 ADMIN | **Destruktif** — mengosongkan tabel pengguna, lencana, dan studi kasus, lalu mengisi ulang data demo |

> Dijaga dua lapis: wajib token admin, **dan** modulnya tidak didaftarkan saat `NODE_ENV=production` kecuali `ENABLE_SEED_ENDPOINT=true`. Di produksi, permintaan ini normalnya menghasilkan 404 karena rutenya memang tidak ada.

## 15. Notifikasi langsung (WebSocket)

| Aspek | Nilai |
|---|---|
| Transport | socket.io, namespace bawaan |
| Autentikasi | `handshake.auth.token` atau header `Authorization`; token tidak valid → koneksi diputus |
| Room | `user_<userId>` — satu pengguna boleh punya banyak koneksi (banyak tab) |
| CORS | `https://tolongin.co`, `https://frontend-tolongin.vercel.app`, `http://localhost:3000` |
| Dipakai untuk | Hasil verifikasi identitas, notifikasi baru, pembaruan status submisi |

Klien: `frontend/contexts/SocketContext.tsx`.

## 16. Cara aplikasi web memanggil API — rincian teknis

- Semua panggilan lewat `frontend/services/api.ts` (`apiClient`, axios); basis URL dari `NEXT_PUBLIC_API_URL` (`lib/apiConfig.ts`).
- Alternatifnya `next.config.ts` mem-proxy `/api/:path*` ke `BACKEND_ORIGIN` — berguna saat pengembangan lokal.
- 18 modul service membungkus kelompok endpoint di atas: `auth`, `challenges`, `companies`, `notifications`, `payments`, `portfolios`, `questionBank`, `skills`, `stages`, `storage`, `submissions`, `subscriptions`, `talents`, `token`, `verification`, `adminApi`, `api`, dan `piston` (eksekusi kode untuk soal live coding).
