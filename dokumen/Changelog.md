# Riwayat Perubahan — Tolongin.co

**Dokumen**: Changelog · sumber riwayat Git backend (136 catatan perubahan) dan frontend (135), 2026-05-24 s.d. 2026-08-07

> Istilah teknis dijelaskan di [glosarium](README.md#glosarium). Bagian berjudul **"— rincian teknis"** aman dilewati bila Anda tidak menulis kode.

---

## 1. Cara membaca dokumen ini

Proyek ini **belum memberi nomor versi pada rilisnya**. Nomor yang tercatat hanya `0.0.1` (server) dan `0.1.0` (aplikasi web), dan keduanya tidak pernah dinaikkan sejak hari pertama. Setiap perubahan langsung masuk ke jalur utama dan langsung dirilis — tidak ada "versi 1.2" yang bisa dijadikan patokan.

Karena itu riwayat di bawah disusun **per periode waktu**, bukan per nomor versi.

Tiap periode punya dua bagian:
- **Yang berubah bagi pengguna** — bahasa sehari-hari, bisa dibaca siapa pun.
- **Rincian teknis** — daftar perubahan kode, dengan penanda **[BE]** untuk server dan **[FE]** untuk aplikasi web.

## 2. Ringkasan: delapan perubahan terbesar

Kalau hanya sempat membaca satu tabel, baca yang ini. Semuanya lahir dari masalah nyata, bukan perbaikan kosmetik.

| Perubahan | Kapan | Kenapa penting |
|---|---|---|
| Ujian dinilai per tahap, bukan sekali di akhir | 30 Jul | Sebelumnya tidak ada angka per tahap yang bisa dibandingkan dengan syarat lolos, dan batas waktu per tahap tersimpan tanpa ada yang menegakkannya |
| Soal bisa dipungut satuan, bukan menyalin ujian utuh | 30 Jul | Perusahaan yang mencari Backend Engineer sekarang bisa memungut tiga soal database dan dua soal API lalu menyusun tahapnya sendiri |
| Bidang pekerjaan bisa ditambah sendiri | 31 Jul | Dulu cuma enam pilihan tetap; yang mencari Video Editor terpaksa memilih "Lainnya" |
| Penurunan studi kasus berhenti menghapus karya kandidat | 1 Agu | Satu klik moderasi dulu menghapus permanen portofolio setiap kandidat yang pernah ikut — hukuman untuk perusahaan jatuh ke orang yang tidak bersalah |
| Riwayat perubahan basis data ditulis ulang | 30 Jul | Riwayat lama tidak pernah bisa membangun basis data dari nol; menyiapkan lingkungan baru selalu gagal di tengah jalan |
| Pemeriksaan wajah dibuat serius | 28 Jul | Ganti model, pisahkan proses supaya tidak mati mendadak, dan setel ambang dari hasil pengukuran — bukan tebakan |
| Lencana mengukur sepuluh hal berbeda | 6 Agu | Sebelumnya semua lencana membaca angka XP yang sama pada ambang berbeda; "Bug Hunter — Squashed 100 bugs" sebenarnya cuma berarti "XP ≥ 300". Lencana yang menyatakan hal palsu tentang seseorang lebih buruk daripada tidak ada lencana |
| Pengujian jadi syarat sebelum rilis | 30 Jul – 3 Agu | Sebelumnya perubahan langsung diterapkan ke server produksi tanpa satu pun pemeriksaan |

---

## 3. Agustus 2026

### Yang berubah bagi pengguna

- **Lencana akhirnya berarti.** Kini ada sepuluh jenis pencapaian yang benar-benar berbeda: jumlah studi kasus yang lulus, kelulusan bernilai tinggi, keluasan bidang yang pernah dijalani, identitas terverifikasi, jumlah tulisan di diskusi, jumlah diterima kerja, dan lainnya. Sebelumnya semuanya cuma XP dengan nama berbeda. Lencana juga **benar-benar diberikan** sekarang — sebelumnya hanya ditampilkan.
- **Karya kandidat aman dari sanksi perusahaan.** Bila admin menurunkan sebuah studi kasus, portofolio dan nilai kandidat yang pernah mengerjakannya tetap utuh.
- **Panel admin tertutup rapat.** Akun bukan admin yang mencoba membuka halaman admin dipulangkan.
- **Tombol hapus di pengaturan profil benar-benar menghapus.** Sebelumnya beberapa di antaranya tidak tersambung ke server — tampak berhasil, padahal tidak.
- **Papan peringkat bisa disaring**, dan bidang pekerjaan talenta akhirnya tampil terisi.
- **Verifikasi KTP jadi syarat, bukan saran.** Pada studi kasus berpengawasan, kandidat yang belum terverifikasi tidak lagi bisa membuka kamera atau memulai pengerjaan — muncul ajakan verifikasi lengkap dengan tautan langsung ke halamannya. Sebelumnya cuma peringatan kuning yang bisa dilewati.
- **Pemindaian wajah pindah ke pop-up.** Kamera KYC dan pengecekan wajah peserta kini muncul sebagai jendela mengambang yang bisa ditutup, bukan menyisip di tengah halaman.
- **Kartu studi kasus dan halaman depan dirombak tampilannya**, termasuk area unggah KTP yang sekarang memberi tanggapan saat berkas ditarik ke atasnya.
- **Verifikasi yang ditolak akhirnya terlihat ditolak.** Sebelumnya layarnya tetap hijau dan berbunyi "Identitas Terverifikasi!" — kandidat yang gagal tidak pernah tahu ia gagal, apalagi alasannya.

### Rincian teknis

**8 Agu**
- [FE] `fix` verifikasi KTP yang **ditolak** akhirnya terdeteksi dan tampil sebagai penolakan. Halaman KYC membandingkan status dengan `'REJECTED'`, sedangkan backend mengirim `'FAILED'` — cabangnya tidak pernah benar, dan penolakan jatuh ke tampilan hijau "Identitas Terverifikasi!".
- [FE] `fix` gerbang KYC ruang kerja membaca satu sumber: `status` dari `GET /verification/status`, dengan nilai store hanya sebagai isian sementara sebelum jawaban tiba. Cabang `'APPROVED'` dan pembacaan `.data.status` dibuang — keduanya tidak pernah cocok dengan bentuk jawaban maupun enum `VerificationStatus`.
- [FE] `fix` bawaan alamat backend dipilih per lingkungan di `next.config.ts` dan `lib/apiConfig.ts`. Bawaan produksi yang dipatok membuat `next dev` tanpa `NEXT_PUBLIC_API_URL` menulis ke basis data produksi tanpa satu pun galat.
- [FE] `refactor` tipe `VerificationStatus` di `types/index.ts` mencerminkan enum Prisma, dan `verificationService.getStatus()` memakainya sebagai tipe kembalian — salah ketik status kini menjadi galat tipe, bukan cabang mati.
- [FE] `chore` `react-parallax` dilepas; tidak diimpor satu berkas pun.

**7 Agu**
- [FE] `feat` gerbang KYC di `workspace/[enrollmentId]`: `handleStartWebcam` dan tombol mulai pada mode berpengawasan berhenti bila `isKycVerified` bernilai salah, menampilkan modal ajakan ke `/settings/kyc`. Status dibaca berlapis — `verificationStatusData.status`, `.data.status`, lalu `user.profile.faceVerificationStatus`.
- [FE] `feat` `FaceScanner` dibungkus modal `AnimatePresence` di halaman KYC dan ruang kerja; `DraftStatusBar` dapat mode `isExamMode` sehingga sekaligus menjadi navbar pengerjaan soal (judul, sisa waktu tahap, status simpan, tombol keluar).
- [FE] `style` kartu studi kasus, hero, footer, dan bagian nilai inti dirombak; delapan aset SVG maskot dan latar ditambahkan.
- [FE] `fix` `@vladmandic/face-api` dilepas dari `optimizePackageImports` di `next.config.ts` — paketnya sudah tidak lagi menjadi dependensi, dan build gagal karenanya.
- [FE] `chore` bawaan alamat backend di `next.config.ts` dan `lib/apiConfig.ts` berpindah dari `http://localhost:3001` ke `https://podorukunspk.fun`; `pnpm-lock.yaml` disinkronkan; `react-parallax` ^3.5.2 ditambahkan (belum terpakai di kode).

**6 Agu** — [BE] `feat` enum `BadgeCriteria` + kolom `threshold`/`param`, satu penilai per kriteria di `BadgesService`; migrasi `badge_criteria`.

**3 Agu**
- [BE] `feat` lencana benar-benar diberikan, bukan hanya ditampilkan.
- [BE] `ci` `prisma migrate deploy` masuk alur penyebaran, **hanya di satu job** — dua job terhadap basis data yang sama akan berebut tabel `_prisma_migrations`.
- [BE] `ci` job deploy VPS 1 dihapus (mesin sudah mati, membuat seluruh alur merah); `POST /skills` yang melewati pemeriksaan AI ditutup.
- [BE] `ci` satu sumber versi pnpm; `version: 10` yang bentrok dengan `packageManager` dibuang. Sebelumnya CI gagal sebelum satu uji pun berjalan dan VPS tertinggal enam perubahan.
- [BE] `fix` `.gitignore` mengabaikan seluruh varian `.env`, bukan lima nama tepat.
- [BE] `chore` impor mati dibuang; aturan lint yang menyembunyikannya dinyalakan lagi.
- [FE] `fix` `useWatch` di halaman daftar; peringatan lint terakhir tuntas.
- [FE] `chore` tipe dan aset mati dibuang; dua `eslint-disable` tanpa efek dihapus.
- [FE] `refactor` konfirmasi hapus bagian profil memakai `ConfirmDialog`, bukan `window.confirm`.
- [FE] `feat`/`fix` penghapus bagian profil (Keahlian, Tentang) tersambung ke backend.
- [FE] `perf` podium papan peringkat lewat `next/image`.

**2 Agu** — [BE] `fix` papan peringkat bisa disaring di server, bidang talenta terisi. [FE] `fix` satu sumber untuk bidang pekerjaan dan alamat backend.

**1 Agu**
- [BE] `fix(admin)` takedown berhenti menghapus portofolio; moderasi menandai (`takenDownAt`) alih-alih `prisma.challenge.delete` yang berantai sampai `Portfolio`. Migrasi `challenge_takedown_soft_delete`.
- [BE] `chore` hook verifikasi tipe diversikan di repo backend.
- [FE] `fix(admin)` non-admin dipulangkan dari panel admin; dua fitur tanpa sisi pengguna dihidupkan.

## 4. Akhir Juli 2026

### Yang berubah bagi pengguna

- **Ujian jadi berjenjang sungguhan.** Tiap tahap punya batas waktu sendiri dan syarat lolos yang bisa diatur: terbuka untuk semua, nilai minimal, hanya N teratas, atau diloloskan satu per satu. Kandidat melihat sisa waktu yang benar (dihitung server) dan alasan mengapa sebuah tahap masih terkunci.
- **Bank soal menggantikan template.** Perusahaan memungut soal satu per satu, bukan menyalin satu ujian utuh. Soal yang disunting di bank tidak mengubah ujian yang sedang dikerjakan orang.
- **Soal psikotes tersedia**, dan hasilnya sengaja **tidak** ikut menentukan nilai — skala setuju/tidak setuju tidak punya jawaban benar.
- **Bidang pekerjaan bisa ditambah sendiri** saat membuat studi kasus, lengkap dengan konfirmasi bila yang diketik ternyata memang bidang baru.
- **Pembuat studi kasus dipecah jadi langkah bertahap**, tiap langkah diperiksa sebelum lanjut, draf tersimpan otomatis ke server, dan urutan soal bisa digeser dengan seret-lepas.
- **Jawaban berupa video benar-benar terunggah** — sebelumnya gagal diam-diam.

### Rincian teknis

**31 Jul**
- [BE] `feat` bidang pekerjaan diambil dari direktori keahlian, bukan daftar tertutup; migrasi `job_category_from_skill_directory`.
- [BE] `feat` mode tahap mati dibuang, posisi yang direkrut dicatat (`Challenge.role`); migrasi `drop_section_stage_type` dan `challenge_role_and_other_category`.
- [BE] `fix` satu gerbang tulis ke direktori; keahlian diukur dengan ukurannya sendiri.
- [BE] `ci` job `test` berjalan pada pull request; job deploy dipagari `github.event_name == 'push' && github.ref == 'refs/heads/main'`.
- [BE] `chore` pnpm dipatok 11.10.0 lewat `packageManager`.
- [FE] `feat` pemilih bidang pekerjaan yang boleh diisi sendiri + konfirmasi bidang baru.
- [FE] `feat` soal tahap disusun dua tingkat; tipe soal berhenti hilang saat disimpan.
- [BE][FE] `docs` `CLAUDE.md` per repo menggantikan boilerplate.

**30 Jul**
- [BE] `feat` model `StageAttempt` + enum `StageGateMode`/`GateScoreBasis`/`StagePendingPolicy`; migrasi `stage_gating`.
- [BE] `feat` template ujian diganti bank soal modular; soal psikometrik ditambahkan. Migrasi `question_bank`, `psychometric`, `dissolve_templates`.
- [BE] `fix` riwayat migrasi yang tidak pernah bisa membangun basis data diganti — `0_init` baru, riwayat lama pindah ke `migrations-archive/`.
- [BE] `fix` `POST /seed` mewajibkan token admin dan tidak lagi dikirim ke produksi.
- [BE] `ci` uji dijalankan sebelum penyebaran; konfigurasi uji integrasi diperbaiki; skrip basis data uji lokal ditambahkan.
- [BE] `style` `npm run lint` dibuat berarti (tanpa `--fix`) dan temuannya diperbaiki.
- [FE] `feat` tahap dikunci di balik keputusan server; timer per tahap yang sebenarnya ditampilkan.
- [FE] `feat` tiap langkah builder digerbang, draf autosave ke server, urutan soal seret-lepas, **vitest ditambahkan**.
- [FE] `feat` alur "tanya posisi yang direkrut lebih dulu"; soal dipungut dari bank.
- [FE] `fix` builder dipecah bertahap; jawaban video benar-benar terunggah; draf dibersihkan setelah simpan.

**29 Jul**
- [BE] `fix` celah bypass validasi penerbitan ditutup; pengarsipan challenge ditambahkan.
- [BE] `fix(company)` upgrade gratis ditutup, kebocoran lintas penyewa dan nilai ganda diperbaiki.
- [BE] `feat(challenges)` halaman "Challenge Saya", jalur admin, validasi, kuota talenta.
- [BE] `feat` alur persetujuan anggota tim; peran anggota dihapus sehingga pengelolaan hanya milik pemilik.
- [BE] `chore` batas paket dimatikan untuk pengembangan — dirapikan jadi saklar `ENFORCE_SUBSCRIPTION_LIMITS`.
- [BE] Migrasi pendukung: `add_password_reset_tokens`, `company_legality_documents`, `submission_sla_reminder`, `challenge_proctoring_settings_column`.
- [FE] `feat` logika pengerjaan soal sisi kandidat; halaman "Challenge Saya" + draf per pengguna; pembatasan UI menurut peran anggota.
- [FE] `fix` kebocoran surel ditutup, nilai ganda dicegah, paginasi ditangani; jalan buntu di alur pembuatan challenge diperbaiki.

## 5. Pertengahan Juli 2026 — identitas dan pengerasan

### Yang berubah bagi pengguna

- **Verifikasi wajah dibuat serius.** Model pengenalan diganti, batas kemiripan disetel dari hasil pengukuran nyata, dan sistem berhenti otomatis meloloskan kasus yang meragukan.
- **Satu orang tidak bisa punya banyak akun.** Wajah yang sudah terdaftar akan ditolak; kasus abu-abu masuk antrean untuk diperiksa admin lewat halaman baru.
- **Pesan galat berhenti menyalahkan pengguna.** Bila mesin pemeriksa yang bermasalah, pesannya tidak lagi berbunyi "wajah Anda tidak cocok".
- **Foto yang dikirim tidak lagi terbalik cermin.**
- **Kandidat diberi tahu kalau statusnya sedang menunggu tinjauan** — sebelumnya diam tanpa penjelasan.
- **Generator AI jadi dua langkah**: kerangka dulu yang bisa diubah, baru soal lengkap. Progresnya tidak hilang saat halaman dimuat ulang.
- **Profil punya slug yang enak dibaca** menggantikan deretan huruf acak, dan tautan lama tetap berfungsi.

### Rincian teknis

**28 Jul** — periode terpadat untuk mesin biometrik:
- [BE] `feat` model wajah diganti ke Facenet512; migrasi `facenet512_embeddings`.
- [BE] `fix` worker TensorFlow dan PyTorch dipisah ke proses berbeda — mengakhiri `SIGSEGV` akibat konflik runtime OpenMP/MKL.
- [BE] `fix` `retinaface` didahulukan; ambang disetel dari pengukuran; ambang foto-vs-foto untuk anti-joki; ambang selfie-vs-KTP dipisah sesuai domainnya.
- [BE] `fix` dedupe ditegakkan (tolak < 0,35 · tinjau < 0,42); celah status `PENDING` ditutup; zona tinjau tidak lagi otomatis terverifikasi.
- [BE] `fix` `tf-keras` dijadikan wajib; `FaceEngineUnavailableError` memisahkan kegagalan mesin dari ketidakcocokan wajah.
- [BE] `fix` `requirements.txt` disamakan dengan stack produksi; pin opencv/numpy yang membuat pemasangan buntu diperbaiki.
- [BE] `fix` skrip pemeliharaan identitas jalan lagi di Prisma 7; data yang gagal didekripsi ditangani.
- [BE] `fix` Prisma CLI diarahkan ke koneksi langsung untuk migrasi.
- [BE] `fix` kebocoran identitas ditutup, indeks ditambahkan. Migrasi `add_indexes_and_invite_code_expiry`, `pgvector_identity_dedupe`.
- [FE] `feat` halaman tinjauan identitas untuk admin; status menunggu tinjauan dijelaskan ke pengguna.
- [FE] `fix` kebocoran template biometrik dihentikan; foto tidak lagi dicerminkan; host gambar bawaan didaftarkan.

**27 Jul** — [BE] kolom yang hilang ditambahkan ke skema. [FE] konflik routing dinamis diperbaiki.

**24 Jul**
- [BE][FE] `feat` generasi AI dua langkah; rute create/edit dipisah; deteksi aset yang dibutuhkan; keluaran AI dipaksa berbahasa Indonesia; state generator disimpan di localStorage.
- [BE] `chore` konfigurasi basis data pindah ke Supabase.

**22 Jul** — [BE][FE] `feat` portofolio disesuaikan untuk privasi publik. [FE] `feat(b2b)` penanda merah anti-joki, ekspor PDF, kloning template. [BE] `chore(devops)` `ecosystem.config.js`, CORS, dan pipeline deploy diperbarui.

**19 Jul** — [BE][FE] `feat(slug)` slug profil dengan kompatibilitas mundur. [FE] `feat` UX ruang kerja: panel bisa diubah ukuran, autosave, UI pengawasan.

**11–15 Jul** — [BE] `feat(admin)` lima fitur admin lanjutan (ban, takedown, peringatan, pengumuman, audit log). [BE] `chore` rute backend diamankan. [FE] `feat(admin)` UI panel admin diperluas; `AuthGuard` global; wizard registrasi perusahaan. [BE] `ci` alur VPS kedua ditambahkan (dihapus 3 Agu).

## 6. Awal Juli 2026 — fondasi B2B, KYC, dan AI

### Yang berubah bagi pengguna

- **Verifikasi identitas lewat kamera** hadir pertama kali, diproses di latar belakang dengan pemberitahuan langsung begitu selesai.
- **Penilaian AI berbasis rubrik** mulai berjalan.
- **Panel admin, pemantauan, dan notifikasi langsung** hadir.
- **Foto profil publik dipisah dari foto identitas privat**, disertai penjelasan bahwa data identitas disimpan terenkripsi.
- **Perusahaan bisa mengundang anggota tim** lewat kode undangan, lengkap dengan catatan aktivitas.

### Rincian teknis

**4–7 Jul**
- [BE][FE] `feat` fitur B2B lengkap: admin, SEO, Sentry, WebSocket, pengujian.
- [BE][FE] `feat` sistem rubrik AI + KYC liveness.
- [BE] `feat` pemrosesan KYC dipindah ke latar belakang dengan notifikasi WebSocket.
- [BE] `fix` segfault OpenMP saat memuat PyTorch dan TensorFlow diatasi; `CUDA_VISIBLE_DEVICES=-1`; `scripts/setup-ai.sh` ditambahkan.
- [BE] `fix` kerentanan keamanan kritis diperbaiki.
- [BE] `feat` enkripsi AES-256-GCM untuk data biometrik dan KTP.
- [BE][FE] `feat(team)` manajemen tim, kode undangan, log aktivitas.
- [BE] `chore` `requirements.txt` ditambahkan; `railway.json` dibuang karena penyebaran memakai VPS.

## 7. Juni 2026 — ruang kerja, pembayaran, LMS

### Yang berubah bagi pengguna

- **Pembayaran lewat Midtrans** hadir: top-up token dan langganan.
- **Ruang kerja kandidat** dirombak: alur bertahap, kunci layar penuh saat ujian, editor kode, deteksi wajah dengan kotak pembatas.
- **Halaman tagihan langganan** hadir, dengan fitur yang terkunci sesuai paket.
- **Aplikasi terasa lebih ringan** setelah optimasi gambar dan perbaikan render berlebih.

### Rincian teknis

- **23 Jun** [BE][FE] `feat` payment gateway Midtrans; panjang `order_id` dipendekkan agar tidak 500.
- **25–26 Jun** [FE] `feat` integrasi penuh Assessment Builder dengan generator AI dan ruang kerja kandidat.
- **17–18 Jun** [BE][FE] `feat` komponen ujian dinamis, verifikasi wajah lokal, Monaco editor; seeder ditulis ulang; draf dan batas langganan; alur wizard + kunci layar penuh; halaman tagihan.
- **18 Jun** [FE] `perf` tree-shaking, migrasi ke `next/image`, perbaikan render berlebih Zustand.
- **15–17 Jun** [BE] `fix` galat strict-null di `submissions.service`; `req.user.sub` diseragamkan; endpoint `updateProfile` + perbaikan bug saldo token.
- **18 Jun** [BE] `ci` CI/CD diterapkan (v1 lalu v2).

## 8. Mei 2026 — awal proyek

**24 Mei** — [BE] commit pertama NestJS + Prisma; `engines.node >= 20.19`; konfigurasi build diperbaiki agar keluarannya benar. [FE] commit pertama Next.js.

## 9. Melihat riwayat lengkap

```bash
git -C backend log --date=short --pretty=format:"%ad %h %s"
```

```bash
git -C frontend log --date=short --pretty=format:"%ad %h %s"
```
