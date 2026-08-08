# Teknologi yang Dipakai — Tolongin.co

**Dokumen**: TechStack · analisis 2026-08-06

> Istilah teknis dijelaskan di [glosarium](README.md#glosarium). Bagian berjudul **"— rincian teknis"** aman dilewati bila Anda tidak menulis kode.

---

## 1. Bahan bangunan, dalam bahasa sehari-hari

| Bagian | Yang dipakai | Kenapa perlu |
|---|---|---|
| Tampilan yang dilihat pengguna | **Next.js** + **React** | Kerangka pembuat halaman web modern; halaman terasa cepat karena sebagian sudah disiapkan sebelum dikirim |
| Otak aplikasi | **NestJS** di atas **Node.js** | Kerangka penyusun server yang memaksa kode tersusun rapi per modul, bukan menumpuk jadi satu |
| Gudang data | **PostgreSQL** (lewat layanan **Supabase**) | Basis data yang matang dan tahan uji |
| Penerjemah ke gudang | **Prisma** | Menerjemahkan perintah program menjadi perintah basis data, sekaligus mencegah salah ketik struktur |
| Pemeriksa wajah dan KTP | **Python** + **TensorFlow**, **DeepFace**, **EasyOCR** | Pustaka pengenalan wajah dan pembaca tulisan terbaik hidup di dunia Python, bukan di dunia web |
| Penulis dan penilai soal | **Model bahasa (AI)** lewat antarmuka standar OpenAI | Menyusun draf studi kasus dan menilai jawaban esai |
| Penyimpan berkas | **Cloudflare R2** | Video dan dokumen kandidat tidak boleh menumpuk di server aplikasi |
| Pembayaran | **Midtrans** | Gerbang pembayaran lokal Indonesia |
| Pengirim surel | **Resend** | Surel pemulihan kata sandi dan notifikasi |
| Pemantau masalah | **Sentry** | Melaporkan galat beserta konteksnya, tanpa perlu menunggu pengguna melapor |

**Bahasa pemrograman** yang dipakai: TypeScript untuk aplikasi web dan server, Python untuk pemeriksa biometrik, SQL untuk basis data.

## 2. Kenapa versi tidak sembarang dinaikkan

Tiga hal di proyek ini akan rusak diam-diam bila versinya digeser tanpa pemeriksaan:

**Pemeriksa wajah.** Menaikkan versi TensorFlow atau pustaka pengolah gambar **menggeser hasil pelurusan wajah**. Jarak antara "pasangan foto orang yang sama" dan "pasangan orang berbeda" hanya terpaut sekitar **0,075** — sangat sempit. Setelah naik versi, ambangnya wajib diukur ulang, kalau tidak sistem akan mulai menolak orang yang benar atau meloloskan yang salah.

**Alat pemasang paket (pnpm).** Versinya dipatok di satu tempat. Menyebutkannya lagi di tempat lain membuat pemeriksa otomatis berhenti dengan galat sebelum satu pun uji berjalan — pernah terjadi, dan akibatnya server produksi tertinggal enam perubahan tanpa ada yang sadar.

**Kapasitas mesin.** Server produksi hanya 2 inti dan 2 GB memori. Pemeriksa wajah dijalankan satu proses saja; dua proses menahan ~1,45 GB dan saling berebut. Menaikkannya tanpa menambah memori akan membuat server mati-hidup sendiri.

---

## 3. Ringkasan versi — rincian teknis

| Lapisan | Teknologi |
|---|---|
| Frontend | Next.js 16.2.6 (App Router) · React 19.2.4 · TypeScript 5 · Tailwind CSS 4 |
| Backend | NestJS 11 · Node.js ≥ 20.19 · TypeScript 5.7 · Express 5 |
| Basis data | PostgreSQL (Supabase) + pgvector · Prisma 7.8 |
| ML | Python 3.11/3.12 · TensorFlow 2.21 · DeepFace · EasyOCR · PyTorch 2.12 |
| LLM | OpenAI SDK 6 terhadap endpoint kompatibel (bawaan `ai.sumopod.com/v1`, model `gpt-4o`) |
| Infrastruktur | VPS + pm2 (backend) · Vercel (frontend) · Cloudflare R2 · Midtrans · Resend · Sentry |
| Manajer paket | pnpm 11.10.0 (dipatok lewat `packageManager`) |

## 4. Backend — dependensi runtime

| Paket | Versi | Peran |
|---|---|---|
| `@nestjs/common`, `@nestjs/core` | ^11.0.1 | Kerangka aplikasi |
| `@nestjs/platform-express` + `express` | ^11.0.1 / ^5.2.1 | Server HTTP |
| `@nestjs/config` | ^4.0.4 | Konfigurasi global dari `.env` |
| `@nestjs/jwt` | ^11.0.2 | Penerbitan & verifikasi token |
| `@nestjs/swagger` | ^11.4.3 | Dokumentasi API di `/api/docs` |
| `@nestjs/throttler` | ^6.5.0 | Batas frekuensi permintaan |
| `@nestjs/schedule` | ^6.1.3 | Enam pekerjaan terjadwal |
| `@nestjs/websockets` + `@nestjs/platform-socket.io` + `socket.io` | ^11.1.27 / ^4.8.3 | Notifikasi langsung |
| `@nestjs/terminus` | ^11.1.1 | Pemeriksaan kesehatan server |
| `@prisma/client` + `@prisma/adapter-pg` + `pg` | ^7.8.0 / ^8.20.0 | Akses basis data |
| `class-validator` + `class-transformer` | ^0.15.1 / ^0.5.1 | Validasi isian permintaan |
| `bcrypt` | ^6.0.0 | Pengaman kata sandi |
| `helmet` | ^8.2.0 | Header keamanan |
| `@aws-sdk/client-s3` + `s3-request-presigner` | ^3.1048.0 | Penyimpanan berkas (Cloudflare R2) |
| `multer` + `@types/multer` | ^2.2.0 | Unggahan multipart |
| `openai` | ^6.38.0 | Klien model bahasa |
| `midtrans-client` | ^1.4.3 | Pembayaran |
| `resend` | ^6.17.1 | Surel transaksional |
| `@sentry/node` + `@sentry/profiling-node` | ^10.63.0 | Pemantauan galat + performa |
| `rxjs`, `reflect-metadata`, `dotenv` | — | Pendukung NestJS |

**Perkakas pengembangan**: `@nestjs/cli` ^11 · `@nestjs/testing` · `jest` ^30 + `ts-jest` ^29 · `supertest` ^7 · `@faker-js/faker` ^10.5 · `eslint` ^9 + `typescript-eslint` ^8.20 + `eslint-plugin-prettier` · `prettier` ^3.4 · `prisma` ^7.8 + `@prisma/config` · `ts-node`, `tsconfig-paths`, `ts-loader`, `source-map-support`.

## 5. Frontend — dependensi runtime

| Paket | Versi | Peran |
|---|---|---|
| `next` | 16.2.6 | Kerangka halaman, pengoptimal gambar, proxy API |
| `react`, `react-dom` | 19.2.4 | Penyusun antarmuka |
| `@tanstack/react-query` | ^5.100.10 | Pengambilan dan cache data server |
| `zustand` | ^5.0.13 | Penyimpan sesi global |
| `axios` | ^1.16.1 | Pemanggil API |
| `react-hook-form` + `@hookform/resolvers` + `zod` | ^7.76 / ^5.2.2 / ^4.4.3 | Formulir dan aturan validasinya |
| `tailwindcss` 4 + `@tailwindcss/postcss` | ^4 | Penataan tampilan |
| `class-variance-authority`, `clsx`, `tailwind-merge` | — | Varian gaya komponen |
| `framer-motion` | ^12.38.0 | Animasi |
| `lucide-react` | ^1.16.0 | Ikon |
| `@monaco-editor/react` | ^4.7.0 | Editor untuk soal menulis kode |
| `recharts` | ^3.9.2 | Grafik panel admin |
| `react-resizable-panels` | ^4.12.2 | Panel yang bisa diatur ukurannya di ruang kerja kandidat |
| `react-easy-crop` | ^6.1.0 | Pemotongan foto profil dan KTP |
| `react-hot-toast` | ^2.6.0 | Pesan singkat di layar |
| `date-fns` | ^4.4.0 | Format tanggal |
| `socket.io-client` | ^4.8.3 | Saluran notifikasi langsung |
| `@sentry/nextjs` | ^10.63.0 | Pemantauan |

**Perkakas pengembangan**: `typescript` ^5 · `eslint` ^9 + `eslint-config-next` 16.2.6 · `vitest` ^4.1.10 · `@playwright/test` ^1.61.1 · `@types/{node,react,react-dom}`.

> `@vladmandic/face-api` dipakai untuk mendeteksi keberadaan wajah langsung di browser (kotak pembatas saat pengawasan ujian). Pencocokan identitas yang menentukan tetap dilakukan server.

## 6. Lingkungan Python (ML) — rincian teknis

Berkas: `backend/requirements.txt`.

| Paket | Versi | Peran |
|---|---|---|
| `deepface` | 0.0.100 | Pembungkus model wajah (Facenet512) |
| `tensorflow` | 2.21.0 | Runtime DeepFace |
| `tf-keras` | 2.21.0 | **Wajib** — DeepFace 0.0.100 memanggil `validate_for_keras3()` yang melempar `ValueError` pada TensorFlow ≥ 2.16 tanpa paket ini |
| `retina-face` | 0.0.18 | Detektor utama rantai pelurusan wajah |
| `mtcnn` | 1.0.0 | Detektor cadangan |
| `easyocr` | 1.7.2 | Pembaca tulisan pada foto KTP |
| `torch` / `torchvision` | 2.12.1 / 0.27.1 | Runtime EasyOCR |
| `numpy` | 2.5.0 | — |
| `opencv-python-headless` | 5.0.0.93 | Pengolahan citra |

**Aturan lingkungan:**

- Interpreter runtime: `.venv-ml` (Python 3.11.9). `.venv-ml312` (Python 3.12.3) hanya untuk percobaan. `PYTHON_BIN` menunjuk salah satunya.
- **Python 3.14 bawaan sistem tidak bisa dipakai** — belum ada paket TensorFlow untuknya.
- Riwayat konflik: opencv ≥ 4.11 menuntut numpy ≥ 2 sedangkan tensorflow-intel 2.15.1 menuntut numpy < 2, sehingga pemasangan selalu berakhir `ResolutionImpossible`. Hilang sejak TensorFlow 2.21 yang memang berjalan di atas numpy 2.
- Mengganti versi TensorFlow atau opencv menggeser hasil pelurusan wajah — lihat §2.

## 7. Basis data dan migrasi — rincian teknis

| Item | Nilai |
|---|---|
| Mesin | PostgreSQL di Supabase |
| Extension | `pgvector` (kolom `vector(512)` + indeks HNSW) |
| ORM | Prisma 7.8, `prisma-client-js`, driver adapter `pg` |
| Koneksi runtime | `DATABASE_URL` — pooler pgbouncer, **port 6543** |
| Koneksi migrasi | `DIRECT_URL` — koneksi langsung **port 5432**; pooler mematahkan `prisma migrate` |
| Konfigurasi CLI | `prisma.config.ts` |

## 8. Perkakas mutu dan operasional — rincian teknis

| Perkakas | Konfigurasi | Fungsi |
|---|---|---|
| TypeScript | `tsconfig.json` di kedua repo (+ `tsconfig.build.json`, `test/tsconfig.e2e.json` di backend) | Pemeriksaan tipe |
| ESLint 9 (flat config) | `eslint.config.mjs` di kedua repo | Pemeriksaan gaya dan pola berbahaya. `npm run lint` tidak lagi memakai `--fix`, sehingga hasilnya berarti di CI |
| Prettier | `.prettierrc` | Format kode backend |
| Jest 30 | blok `jest` di `package.json` backend | Uji satuan (`*.spec.ts` di `src/`) |
| Jest (e2e) | `test/jest-e2e.json` | Uji integrasi (`*.e2e-spec.ts`) |
| Vitest 4 | `frontend/vitest.config.ts` | Uji logika murni frontend (`environment: node`) |
| Playwright | `frontend/playwright.config.ts` | Uji lewat browser sungguhan (chromium) |
| pm2 | `backend/ecosystem.config.js` | Pengawas proses produksi (`tolongin-backend`, mode fork, restart di 1 GB) |
| GitHub Actions | `backend/.github/workflows/deploy.yml` | Pemeriksaan otomatis + penyebaran ke VPS |
| graphify | `graphify-out/` | Peta keterkaitan kode (2.371 simpul, 4.848 keterkaitan) |
| Hook verifikasi | `backend/scripts/verify.ps1` | Menjalankan pemeriksaan tipe otomatis pada repo yang punya perubahan belum tercatat |

## 9. Berkas eksperimen di luar aplikasi

`generate_churn_dataset.py` + `saas_churn_dataset.csv` di direktori induk: pembangkit data buatan untuk percobaan prediksi berhenti langganan, memakai `pandas` dan `numpy`. Isinya 5.000 baris, lima ciri perilaku, kelas tidak seimbang (~12%), plus nilai kosong yang disisipkan sengaja. **Tidak dipanggil backend maupun frontend.**

## 10. Ringkasan patokan versi dan alasannya

| Patokan | Alasan |
|---|---|
| `pnpm@11.10.0` lewat `packageManager` | Satu sumber versi. Menyebutkannya juga di konfigurasi CI membuat pemeriksaan berhenti dengan galat "Multiple versions of pnpm specified" |
| `engines.node >= 20.19.0` | Persyaratan Prisma 7 |
| Node 22 di mesin pemeriksa CI | Menyamakan dengan versi di VPS |
| `tf-keras` mengikuti versi TensorFlow | Persyaratan keras DeepFace 0.0.100 |
| `FACE_WORKER_POOL_SIZE=1` | Batas memori VPS — lihat §2 |
