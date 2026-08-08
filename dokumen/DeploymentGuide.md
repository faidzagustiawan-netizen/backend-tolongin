# Panduan Penyiapan dan Rilis — Tolongin.co

**Dokumen**: DeploymentGuide · analisis 2026-08-06

> Istilah teknis dijelaskan di [glosarium](README.md#glosarium). Bagian berjudul **"— rincian teknis"** aman dilewati bila Anda tidak menulis kode.

---

## 1. Aplikasinya berjalan di mana

Tolongin tidak berjalan di satu tempat. Bagian-bagiannya dititipkan ke penyedia yang berbeda, masing-masing sesuai keahliannya:

| Bagian | Tempatnya | Penjelasan |
|---|---|---|
| Tampilan yang dibuka pengguna | **Vercel** | Layanan khusus aplikasi web. Setiap perubahan yang masuk jalur utama otomatis dibangun ulang dan tayang |
| Otak aplikasi | **VPS** — komputer sewaan di internet | Dijaga program pengawas (**pm2**) yang menyalakan ulang bila mati |
| Pemeriksa wajah dan KTP | **Di VPS yang sama**, sebagai proses terpisah | Dinyalakan oleh otak aplikasi saat server hidup |
| Gudang data | **Supabase** | Layanan basis data terkelola |
| Berkas kandidat (video, dokumen) | **Cloudflare R2** | Penyimpanan berkas; tidak menumpuk di VPS |

**Ukuran VPS-nya kecil: 2 inti, 2 GB memori.** Angka ini menjelaskan banyak keputusan di dokumen ini — terutama kenapa pemeriksa wajah hanya boleh satu proses.

## 2. Bagaimana rilis terjadi

Sekali perubahan masuk jalur utama, prosesnya berjalan sendiri:

```
 Perubahan dikirim ke jalur utama (main)
        │
        ▼
 ┌───────────────────────────────────────────┐
 │ Robot pemeriksa                           │
 │  1. pasang kebutuhan                      │
 │  2. periksa kecocokan tipe data           │
 │  3. periksa gaya penulisan kode           │
 │  4. jalankan 224 uji satuan               │
 │  5. siapkan basis data uji                │
 │  6. jalankan 10 uji integrasi             │
 └───────────────────┬───────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
   ada yang gagal            semua lolos
        │                         │
        ▼                         ▼
   RILIS DIBATALKAN     ┌───────────────────────────┐
   (produksi tidak      │ Masuk ke VPS lewat SSH:   │
    tersentuh)          │  · ambil kode terbaru     │
                        │  · pasang kebutuhan       │
                        │  · terapkan perubahan     │
                        │    struktur basis data    │
                        │  · bangun aplikasi        │
                        │  · nyalakan ulang         │
                        └───────────────────────────┘
```

Dua penjagaan penting di alur ini:

1. **Pemeriksaan dijalankan di komputer robot, bukan di server produksi.** Server produksi memegang pengaturan rahasia dan basis data sungguhan; menjalankan kode uji di sana berarti menaruhnya satu langkah dari data asli.
2. **Membuka usulan perubahan tidak ikut merilis.** Robot memang menjalankan pemeriksaan pada usulan perubahan, tapi langkah rilisnya dipagari khusus untuk jalur utama. Tanpa pagar itu, siapa pun yang membuka usulan perubahan akan ikut merilis ke produksi.

> **Perhatian**: langkah "ambil kode terbaru" **membuang seluruh perubahan lokal di VPS**. Jangan pernah menyunting berkas langsung di server — suntingan itu hilang pada rilis berikutnya tanpa peringatan.

## 3. Tentang pengaturan rahasia

Aplikasi butuh kata sandi basis data, kunci layanan pembayaran, kunci AI, dan sebagainya. Semuanya disimpan di berkas terpisah bernama `.env`, di luar kode.

**Aturan keras proyek ini:**
- Isi `.env` **tidak boleh dibaca, dicetak, atau disalin** ke dokumen mana pun — termasuk dokumen ini.
- **Tidak boleh ditempel ke percakapan** dengan siapa pun, termasuk asisten AI. Apa pun yang ditempel tersimpan permanen di riwayat percakapan.
- Berkas `.env` sudah dikecualikan dari pencatatan kode dan belum pernah ikut tercatat — pertahankan begitu.

Yang boleh dicatat hanyalah **nama** pengaturannya dan gunanya, seperti tabel di §4.

---

## 4. Daftar pengaturan — rincian teknis

Untuk memeriksa kunci yang ada, tampilkan **namanya saja**:

```bash
grep -oE '^[A-Z0-9_]+' backend/.env
```

### 4.1 Backend (`backend/.env`)

| Variabel | Wajib | Keterangan |
|---|---|---|
| `DATABASE_URL` | ya | Koneksi runtime — pooler pgbouncer, **port 6543** |
| `DIRECT_URL` | ya | Koneksi langsung **port 5432**, dipakai untuk migrasi. Pooler mematahkan `prisma migrate` |
| `NODE_ENV` | ya | `production` mematikan Swagger dan menutup pendaftaran `SeedModule` |
| `PORT` | — | Bawaan 3001 |
| `JWT_SECRET` | ya | Penandatangan token (juga dipakai gateway WebSocket) |
| `JWT_EXPIRATION` | — | Masa berlaku token |
| `APP_SECRET` | ya | Kunci enkripsi AES-256 data identitas |
| `ALLOW_LEGACY_DECRYPT` | — | Membaca data identitas format lama saat rotasi kunci |
| `FRONTEND_URL` | ya | Basis tautan pemulihan kata sandi |
| `RESEND_API_KEY` | ya | Surel transaksional |
| `SENTRY_DSN` | — | Kosong berarti pelaporan mati |
| `OPENAI_API_KEY` | ya | Kunci penyedia model bahasa |
| `AI_BASE_URL` | — | Bawaan `https://ai.sumopod.com/v1` |
| `AI_MODEL` | — | Bawaan `gpt-4o` |
| `PYTHON_BIN` | ya | Path interpreter `.venv-ml` |
| `FACE_WORKER_POOL_SIZE` | — | **Setel 1 di VPS 2 GB** |
| `OCR_WORKER_POOL_SIZE` | — | Ukuran pool pembaca KTP |
| `IDENTITY_DEDUPE_REJECT_DISTANCE` | — | Bawaan `0.35` |
| `IDENTITY_DEDUPE_REVIEW_DISTANCE` | — | Bawaan `0.42` |
| `IDENTITY_DEDUPE_MODE` | — | `shadow` = mencatat tanpa menolak; nilai lain = menegakkan (bawaan) |
| `STORAGE_ENDPOINT` | ya | Cloudflare R2 — **tanpa nilai bawaan; aplikasi gagal start bila kosong** |
| `STORAGE_ACCESS_KEY` | ya | idem |
| `STORAGE_SECRET_KEY` | ya | idem |
| `STORAGE_BUCKET_NAME` | ya | idem |
| `STORAGE_PUBLIC_URL` | ya | idem |
| `MIDTRANS_SERVER_KEY` | ya | Pembayaran |
| `MIDTRANS_CLIENT_KEY` | ya | Pembayaran |
| `MIDTRANS_IS_PRODUCTION` | ya | `true`/`false` |
| `ENFORCE_SUBSCRIPTION_LIMITS` | — | `true` menegakkan kuota paket dan kunci fitur AI |
| `ENABLE_SEED_ENDPOINT` | — | `true` mendaftarkan `SeedModule` **bahkan di produksi**. Jangan disetel kecuali sengaja |
| `SECRET` | — | Dipakai `src/seed/real-data.ts` |
| `TEST_DATABASE_URL` | — | Hanya untuk uji integrasi |

### 4.2 Frontend (`frontend/.env`, contoh di `.env.example`)

| Variabel | Keterangan |
|---|---|
| `NEXT_PUBLIC_API_URL` | Basis alamat API; bawaan `https://podorukunspk.fun` (backend produksi) |
| `BACKEND_ORIGIN` | Tujuan proxy `/api/:path*`; bawaan `https://podorukunspk.fun` (backend produksi) |
| `NEXT_PUBLIC_STORAGE_HOST` | Host gambar penyimpanan; bawaan `storage.tolongin.co` |
| `NEXT_PUBLIC_EXTRA_IMAGE_HOSTS` | Host gambar tambahan, dipisah koma |
| `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` | Kunci publik pembayaran |
| `NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION` | `true`/`false` |
| `NEXT_PUBLIC_ENFORCE_SUBSCRIPTION_LIMITS` | **Harus dinyalakan bersamaan** dengan sisi backend, agar peringatan kuota tidak muncul untuk batas yang tidak sedang ditegakkan |
| `NEXT_PUBLIC_SENTRY_DSN` | Pemantauan |

## 5. Prasyarat mesin — rincian teknis

| Kebutuhan | Versi |
|---|---|
| Node.js | ≥ 20.19 di mesin pengembang; **22** di runner CI dan VPS |
| pnpm | 11.10.0 (dipatok lewat `packageManager`; jangan menyebut versi lain di CI) |
| PostgreSQL | 16 untuk uji lokal; produksi di Supabase |
| Python | 3.11 atau 3.12 untuk lingkungan ML. **Python 3.14 tidak bisa** — belum ada paket TensorFlow |
| pm2 | Di VPS, dimuat lewat nvm |

## 6. Menyiapkan mesin sendiri — rincian teknis

### 6.1 Backend

```bash
cd backend && pnpm install
```

`postinstall` menjalankan `prisma generate`. Isi `.env` sesuai §4.1, lalu:

```bash
cd backend && npm run start:dev
```

Server hidup di `http://localhost:3001/api/v1`, dokumentasi API di `http://localhost:3001/api/docs`.

### 6.2 Frontend

```bash
cd frontend && pnpm install
```

```bash
cd frontend && npm run dev
```

Aplikasi di `http://localhost:3000`.

> Di lingkungan pengembangan berbantuan agen, gunakan entri `backend` dan `frontend` pada `.claude/launch.json` alih-alih shell mentah.

### 6.3 Lingkungan Python (pemeriksa wajah dan KTP)

Windows:

```bash
py -3.12 -m venv backend/.venv-ml
```

```bash
backend/.venv-ml/Scripts/pip install -r backend/requirements.txt
```

Linux/VPS: `scripts/setup-ai.sh` menyiapkan interpreter dan mengunduh bobot model.

Setelah itu arahkan `PYTHON_BIN` ke interpreter tersebut. Verifikasi cepat:

```bash
backend/.venv-ml/Scripts/python.exe -m py_compile backend/src/ai/python/face_worker.py backend/src/ai/python/ocr_worker.py
```

> `.venv-ml312` ada untuk percobaan, **bukan** interpreter runtime.

### 6.4 Basis data dan data awal

```bash
cd backend && npx prisma migrate deploy
```

```bash
cd backend && npm run seed
```

```bash
cd backend && npm run seed:question-bank
```

Untuk basis data uji integrasi, lihat [TestingPlan.md §4](TestingPlan.md#4-uji-integrasi-backend--rincian-teknis).

## 7. Mengubah struktur basis data — rincian teknis

### 7.1 Aturan tetap

1. Migrasi **wajib** lewat `DIRECT_URL` (port 5432). Pooler (6543) mematahkan `prisma migrate`.
2. `prisma migrate deploy` boleh dijalankan tanpa bertanya di lingkungan pengembangan — proyek masih tahap pengembangan, tidak ada data yang perlu dipertahankan.
3. **Hanya satu jalur** yang menjalankan `migrate deploy`. Dua jalur berbarengan terhadap basis data yang sama akan berebut satu tabel `_prisma_migrations`.

### 7.2 Basis data kosong

```bash
cd backend && npx prisma migrate deploy
```

`0_init` membangun 29 tabel, termasuk `CREATE EXTENSION vector` dan indeks HNSW yang ditulis tangan.

### 7.3 Basis data yang sudah berisi

**Jangan menjalankan `0_init` di sana** — berkas itu berisi `CREATE TABLE` untuk seluruh skema dan akan gagal, atau lebih buruk, sebagian berhasil. Tandai sebagai sudah diterapkan:

```bash
cd backend && npx prisma migrate resolve --applied 0_init
```

Perintah itu hanya menulis satu baris ke `_prisma_migrations`; tidak ada tabel yang disentuh. Lalu pastikan skemanya memang sudah sesuai:

```bash
cd backend && npx prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema.prisma --script
```

Keluaran kosong berarti sesuai. Bila ada isinya, tinjau SQL-nya dulu — jangan langsung dijalankan.

> **Jebakan**: perintah pembanding pernah melaporkan penghapusan tiga kolom takedown. Itu bukan selisih basis data, melainkan kode di VPS yang tertinggal enam perubahan. **Selalu ambil kode terbaru sebelum mempercayai hasil pembandingan.**

## 8. Alur CI/CD — rincian teknis

Satu alur: `backend/.github/workflows/deploy.yml` (`Deploy to Prod VPS`). Repositori `frontend` **belum punya alur**; penyebarannya ditangani integrasi Vercel.

### Pemicu
- `push` ke `main` → job `test` lalu `deploy`.
- `pull_request` ke `main` → **hanya** job `test`. Job `deploy` dipagari `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`.

### Job `test`
Service PostgreSQL 16 (`POSTGRES_HOST_AUTH_METHOD: trust`), Node 22 dengan cache pnpm, `pnpm/action-setup@v4` **tanpa menyebut versi** (dibaca dari `packageManager`). Langkah lengkap di [TestingPlan.md §6.2](TestingPlan.md#62-ci-backendgithubworkflowsdeployyml-job-test).

### Job `deploy`
Melalui `appleboy/ssh-action@v1.0.3` dengan secret `VPS_IP`, `VPS_USER`, `VPS_SSH_KEY`:

```bash
cd ~/backend-tolongin
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
git fetch --all && git reset --hard origin/main && git pull origin main
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm run build
pm2 reload ecosystem.config.js --env production --update-env || pm2 start ecosystem.config.js --env production
```

### Secret yang menganggur
Job `deploy-vps1` dihapus 3 Agu 2026 — mesin homelab sudah mati, tailnet-nya kosong, dan IP publiknya sudah didaur ulang penyedia. Secret berikut kini tidak dipakai dan boleh dihapus dari repositori: `VPS2_IP`, `VPS2_USER`, `VPS2_SSH_KEY`, `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`.

## 9. Pengawas proses (pm2) — rincian teknis

`backend/ecosystem.config.js`:

| Kunci | Nilai |
|---|---|
| `name` | `tolongin-backend` |
| `script` | `dist/src/main.js` |
| `instances` / `exec_mode` | `1` / `fork` — **bukan cluster**; pool worker Python mengikat proses tunggal |
| `autorestart` | `true` |
| `watch` | `false` |
| `max_memory_restart` | `1G` |
| `env_production` | `NODE_ENV=production`, `PORT=3001` |

Perintah operasional (semua lewat `bash -lc`, lihat §11):

```bash
pm2 status tolongin-backend
```

```bash
pm2 logs tolongin-backend --lines 100
```

```bash
pm2 reload ecosystem.config.js --env production --update-env
```

## 10. Penyebaran aplikasi web (Vercel) — rincian teknis

1. Repositori `frontend-tolongin` terhubung ke Vercel; setiap push ke `main` memicu build.
2. Perintah build: `next build`.
3. Isi variabel `NEXT_PUBLIC_*` dan `BACKEND_ORIGIN` di dashboard Vercel.
4. Alamat frontend yang sudah diizinkan backend: `https://tolongin.co` dan `https://frontend-tolongin.vercel.app`. **Alamat preview Vercel tidak termasuk** — pengujian lintas asal dari URL preview akan ditolak kecuali daftar di `backend/src/main.ts` ditambah.
5. Host gambar baru harus didaftarkan di `next.config.ts` atau lewat `NEXT_PUBLIC_EXTRA_IMAGE_HOSTS`. Pola bebas `**` jangan dikembalikan — itu mengubah aplikasi jadi proxy gambar terbuka.

## 11. Menjalankan perintah di VPS — rincian teknis

Bungkus dengan `bash -lc`. Mesinnya punya dua versi Node, dan perintah SSH biasa memilih versi yang salah karena tidak memuat profil nvm:

```bash
ssh <user>@<host> "bash -lc 'cd ~/backend-tolongin && pm2 status'"
```

## 12. Checklist rilis

1. Ambil kode terbaru; pastikan jalur utama mutakhir.
2. Pemeriksaan tipe, gaya, dan `npm test` hijau di mesin sendiri.
3. Bila struktur basis data berubah: migrasi dibuat dan hasil pembandingan terhadap basis data target kosong.
4. Kirim ke jalur utama repositori backend → pantau robot pemeriksa.
5. Setelah rilis selesai: status proses menunjukkan `online`, dan pemeriksaan kesehatan server menjawab sehat.
6. Untuk aplikasi web: pantau build Vercel, lalu buka halaman utama dan satu halaman dashboard.
7. Periksa laporan galat dalam 15 menit pertama.
8. Perbarui dokumen di folder ini yang terdampak — lihat [aturan pemeliharaan](README.md#aturan-pemeliharaan-dokumen).

## 13. Pemecahan masalah

| Gejala | Penyebab | Tindakan |
|---|---|---|
| Robot pemeriksa gagal sebelum uji berjalan, pesan "Multiple versions of pnpm specified" | Versi pnpm disebut di dua tempat | Hapus `version:` dari konfigurasi alur; `packageManager` satu-satunya sumber |
| `prisma migrate` menggantung atau gagal | Memakai koneksi pooler (6543) | Pakai koneksi langsung (5432) |
| `P3018 ... column "inviteCode" ... does not exist` | Riwayat migrasi lama dari arsip dipakai | Pakai `prisma/migrations/` yang berbasis `0_init` |
| `migrate deploy` gagal: extension `vector` tidak ada | PostgreSQL tanpa pgvector | Untuk pengujian, pakai `scripts/setup-test-db.sh` |
| Migrasi tertahan berstatus `failed` | `0_init` dijalankan pada basis data yang sudah berisi tabel | `prisma migrate resolve --rolled-back <nama>`, lalu baseline dengan `--applied 0_init` |
| `No module named 'tensorflow'` saat verifikasi wajah | `PYTHON_BIN` menunjuk Python sistem | Arahkan ke `.venv-ml` |
| `You have tensorflow 2.21.0 and this requires tf-keras package` | `tf-keras` tidak terpasang | `pip install tf-keras==2.21.0` — versinya mengikuti TensorFlow |
| Pemasangan Python berakhir `ResolutionImpossible` | Kombinasi opencv/numpy/TensorFlow lama | Pakai `requirements.txt` saat ini |
| Pemeriksa wajah mati mendadak di tengah permintaan | TensorFlow dan PyTorch dimuat dalam satu proses | Sudah ditangani lewat pool terpisah. Jangan disatukan kembali |
| Server sering dinyalakan ulang karena memori | Pool pemeriksa wajah terlalu besar untuk 2 GB | `FACE_WORKER_POOL_SIZE=1` |
| Verifikasi wajah tiba-tiba banyak menolak setelah naik versi | Hasil pelurusan wajah bergeser; selisih aman hanya ~0,075 | Ukur ulang jarak dan setel ambang sebelum menganggapnya masih sah |
| `POST /seed` menjawab 404 di produksi | Modulnya memang tidak didaftarkan | Perilaku yang diinginkan. Untuk membuka sementara: `ENABLE_SEED_ENDPOINT=true` (tetap wajib token admin) |
| Peringatan kuota muncul padahal tidak ditegakkan | Saklar frontend dan backend tidak sinkron | Nyalakan keduanya bersamaan |
| Dokumentasi API tidak muncul di produksi | Disengaja — mati saat `NODE_ENV=production` | Gunakan lingkungan non-produksi |
| Gambar gagal dirender | Host belum diizinkan | Tambahkan lewat `NEXT_PUBLIC_EXTRA_IMAGE_HOSTS` atau `next.config.ts` |
| Perubahan di VPS hilang setelah rilis | `git reset --hard origin/main` | Jangan menyunting di VPS; ubah lewat repositori |

## 14. Catatan keamanan operasional

- `.env` tidak pernah tercatat di repositori dan tidak boleh dibagikan lewat kanal percakapan.
- Pengujian **tidak** dijalankan di mesin produksi — mesin itu memegang pengaturan rahasia produksi.
- `scripts/setup-test-db.sh` menimpa `DIRECT_URL` dan menolak host non-lokal, karena `db push` menghapus dan membuat ulang tabel.
- `POST /seed` bersifat destruktif dan dijaga dua lapis: token admin, dan modul yang tidak didaftarkan di produksi.
- Rotasi `APP_SECRET` menuntut `scripts/reencrypt-identity-data.ts`; `ALLOW_LEGACY_DECRYPT` menjembatani masa transisi.
