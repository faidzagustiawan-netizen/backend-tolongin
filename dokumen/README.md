# Dokumentasi Tolongin.co

**Mulai dari sini.** Halaman ini menjelaskan Tolongin dalam bahasa sehari-hari, menunjukkan dokumen mana yang perlu Anda baca, dan memuat **[Glosarium](#glosarium)** untuk setiap istilah teknis yang muncul di dokumen lain.

**Sinkron per**: 2026-08-06 · backend `0.0.1` · frontend `0.1.0`

---

## Tolongin itu apa?

Perusahaan biasa menyaring pelamar lewat CV. Masalahnya, CV hanya klaim — tidak ada yang membuktikan orangnya benar bisa mengerjakan pekerjaan itu.

**Tolongin mengganti CV dengan ujian praktik.** Perusahaan membuat studi kasus mirip pekerjaan sehari-hari, kandidat mengerjakannya langsung di dalam aplikasi, lalu hasilnya dinilai — sebagian otomatis oleh AI, sebagian oleh perekrut. Kandidat yang lulus mendapat portofolio terverifikasi yang bisa dipakai melamar ke mana pun.

Tiga hal yang membuatnya bekerja:

1. **Ujian bertahap.** Seperti seleksi berjenjang: tahap berikutnya baru terbuka bila tahap sebelumnya lolos. Ada batas waktu per tahap, dan yang menghitung waktu adalah server — bukan komputer kandidat, supaya tidak bisa dicurangi.
2. **Pemeriksaan identitas.** Kandidat memotret KTP dan wajahnya. Sistem membaca KTP, mencocokkan wajah, dan memastikan satu orang tidak membuat banyak akun. Saat ujian berlangsung, wajah dicek ulang supaya bukan orang lain yang mengerjakan (istilahnya: **anti-joki**).
3. **Dua sumber pemasukan.** Perusahaan membayar langganan bulanan. Kandidat memakai "token" bila ingin membuat studi kasus sendiri untuk umum.

## Cara membaca dokumentasi ini

Pilih jalur sesuai kebutuhan Anda. Tidak perlu membaca semuanya.

**Saya bukan orang teknis, saya ingin paham produknya**
→ Halaman ini sampai habis, lalu [PRD.md](PRD.md).
Itu saja sudah cukup. Enam dokumen lain boleh dilewati.

**Saya bukan orang teknis, tapi perlu tahu keadaan proyeknya**
→ Halaman ini → [PRD.md](PRD.md) → [Changelog.md](Changelog.md) (bagian "Yang berubah bagi pengguna") → [TestingPlan.md](TestingPlan.md) bagian §1 dan §8 (apa yang sudah dijaga, apa yang masih berisiko).

**Saya pengembang baru di proyek ini**
→ [PRD.md](PRD.md) → [SystemArchitecture.md](SystemArchitecture.md) → [DatabaseSchema.md](DatabaseSchema.md) → [APISpecification.md](APISpecification.md).

**Saya perlu menjalankan atau merilis aplikasinya**
→ [TechStack.md](TechStack.md) → [DeploymentGuide.md](DeploymentGuide.md) → [TestingPlan.md](TestingPlan.md).

### Tanda di dalam dokumen

Setiap dokumen dibagi dua lapis:

- **Ringkasan** — bahasa sehari-hari, tanpa istilah teknis yang belum dijelaskan. Bisa dibaca siapa pun.
- Bagian berjudul **"— rincian teknis"** — untuk pengembang. **Aman dilewati** bila Anda tidak menulis kode; tidak ada informasi produk yang hanya ada di sana.

Istilah teknis yang muncul pertama kali ditautkan ke [Glosarium](#glosarium) di bawah.

## Delapan dokumen

| # | Dokumen | Isinya | Untuk siapa |
|---|---|---|---|
| 1 | [PRD.md](PRD.md) | Produknya untuk siapa, apa saja yang bisa dilakukan tiap jenis pengguna, aturan mainnya, dan apa yang **belum** dibangun | Semua orang |
| 2 | [SystemArchitecture.md](SystemArchitecture.md) | Bagian-bagian sistem dan bagaimana mereka saling bicara — dengan diagram alur | Semua orang (ringkasan) · pengembang (rincian) |
| 3 | [DatabaseSchema.md](DatabaseSchema.md) | Apa saja yang sistem ingat tentang orang, ujian, dan uang | Pengembang · analis data |
| 4 | [APISpecification.md](APISpecification.md) | Daftar perintah yang boleh diminta aplikasi ke server, dan siapa yang boleh memintanya | Pengembang |
| 5 | [TechStack.md](TechStack.md) | Bahan bangunan yang dipakai dan alasan tiap pilihan | Pengembang · pengambil keputusan teknis |
| 6 | [Changelog.md](Changelog.md) | Apa yang berubah, kapan, dan kenapa | Semua orang |
| 7 | [TestingPlan.md](TestingPlan.md) | Bagaimana kami tahu aplikasinya belum rusak — dan bagian mana yang belum dijaga | Semua orang (ringkasan) · pengembang (rincian) |
| 8 | [DeploymentGuide.md](DeploymentGuide.md) | Cara menyiapkan, menjalankan, dan merilis aplikasinya | Pengembang · operasional |

---

## Glosarium

Diurutkan menurut seberapa sering istilahnya muncul, bukan abjad. Analogi di sini sengaja disederhanakan — tujuannya paham maksudnya, bukan tepat secara teknis.

### Bagian-bagian aplikasi

| Istilah | Artinya |
|---|---|
| **Frontend** | Bagian yang Anda lihat dan klik di layar. Ibarat ruang depan toko: etalase, kasir, papan menu. |
| **Backend** | Bagian yang bekerja di balik layar: menghitung, memutuskan, menyimpan. Ibarat dapur dan gudang toko. Pengunjung tidak pernah masuk ke sana. |
| **Database** (basis data) | Tempat semua data disimpan permanen. Ibarat lemari arsip raksasa dengan banyak laci berlabel. |
| **Server** | Komputer yang menyala terus-menerus dan melayani permintaan dari pengguna. |
| **API** | Daftar perintah yang boleh diminta frontend kepada backend. Ibarat menu restoran: hanya yang tercantum yang bisa dipesan, dan sebagian menu hanya untuk tamu tertentu. |
| **Endpoint** | Satu baris di "menu" itu. Contoh: "ambil daftar studi kasus", "kirim jawaban ujian". |
| **Repositori** (repo) | Folder proyek beserta seluruh riwayat perubahannya. Proyek ini punya dua: satu untuk frontend, satu untuk backend. |

### Data dan penyimpanan

| Istilah | Artinya |
|---|---|
| **Tabel** | Satu laci di lemari arsip, mis. laci "pengguna" atau laci "submisi". |
| **Baris** | Satu lembar di dalam laci — satu pengguna, satu submisi. |
| **Kolom** | Satu isian di lembar itu — nama, email, tanggal. |
| **Skema** | Denah lemari arsip: laci apa saja yang ada dan isian apa saja di tiap lembar. |
| **Migrasi** | Perubahan denah lemari — menambah laci baru, mengganti label. Harus dilakukan berurutan dan tercatat, karena arsip lama tidak boleh rusak. |
| **Indeks** | Daftar isi untuk satu laci, supaya mencari tidak perlu membuka semua lembar. Mempercepat pencarian, tapi menambah pekerjaan setiap kali ada lembar baru. |
| **Enum** | Daftar pilihan tertutup. Mis. status ujian hanya boleh salah satu dari: belum mulai, sedang dikerjakan, sudah dikumpulkan. |
| **JSON** | Format teks untuk menyusun data. Fleksibel — dipakai bila bentuk datanya bisa berbeda-beda tiap baris. |
| **Seed** (penyemaian) | Mengisi database dengan data contoh supaya aplikasi bisa dicoba tanpa menunggu pengguna asli. |

### Keamanan dan akses

| Istilah | Artinya |
|---|---|
| **Token** / **JWT** | Kartu identitas digital yang diberikan setelah login. Setiap permintaan berikutnya membawanya, seperti gelang masuk konser. Ada masa berlakunya. |
| **Guard** (penjaga) | Pemeriksa di depan tiap perintah: "Anda siapa? Boleh melakukan ini?" Menolak sebelum perintahnya sempat berjalan. |
| **Peran** (role) | Jenis akun: Talenta (kandidat), Perusahaan, atau Admin. Menentukan perintah apa yang boleh dipakai. |
| **Enkripsi** | Mengacak data supaya hanya bisa dibaca oleh yang punya kuncinya. Dipakai untuk foto KTP dan selfie. |
| **Hash** | Mengubah data jadi sidik jari pendek yang tidak bisa dibalik. Kata sandi disimpan sebagai hash — jadi bocornya isi tabel tidak berarti kata sandinya ikut bocor. |
| **Rate limit** | Batas jumlah permintaan per orang per satuan waktu, supaya satu orang tidak membanjiri server. Di sini: 100 permintaan per menit. |
| **Environment variable** (`.env`) | Pengaturan rahasia yang disimpan di luar kode: kata sandi database, kunci layanan luar. **Tidak pernah ditulis di dokumen mana pun.** |

### Kecerdasan buatan dan biometrik

| Istilah | Artinya |
|---|---|
| **AI** / **LLM** | Model bahasa yang dipakai untuk membuat draf studi kasus dan menilai jawaban esai. |
| **OCR** | Membaca tulisan dari foto. Dipakai untuk mengambil nama dan NIK dari foto KTP. |
| **Embedding wajah** | Wajah diubah jadi deretan angka. Dua foto orang yang sama menghasilkan angka yang berdekatan; orang berbeda berjauhan. Jaraknya bisa diukur — itulah cara sistem tahu dua akun memakai wajah yang sama. |
| **pgvector** | Kemampuan tambahan database untuk menyimpan dan membandingkan deretan angka tadi dengan cepat. |
| **Proctoring** | Pengawasan ujian. Di sini: pengecekan wajah berkala selama kandidat mengerjakan soal. |
| **Anti-joki** | Pencegahan orang lain yang mengerjakan ujian menggantikan kandidat. |
| **KYC** | *Know Your Customer* — pembuktian identitas kandidat lewat KTP dan wajah. |
| **KYB** | *Know Your Business* — pembuktian bahwa perusahaannya benar ada, lewat dokumen legalitas yang ditinjau admin. |

### Menjalankan dan merilis

| Istilah | Artinya |
|---|---|
| **Deploy** | Memindahkan versi terbaru aplikasi ke server supaya dipakai pengguna sungguhan. |
| **CI/CD** | Robot yang otomatis memeriksa kode dan merilisnya setiap ada perubahan. "Memeriksa" di sini: menjalankan seluruh pengujian dulu; kalau ada yang gagal, rilis dibatalkan. |
| **Commit** | Satu paket perubahan kode yang tercatat, lengkap dengan penjelasan dan waktunya. |
| **`main`** | Jalur utama kode — versi yang dianggap resmi. Proyek ini langsung menulis ke sana, tanpa jalur percobaan terpisah. |
| **VPS** | Komputer sewaan di internet, tempat backend berjalan. |
| **pm2** | Pengawas yang menjaga backend tetap hidup: menyalakan ulang bila mati atau kehabisan memori. |
| **Vercel** | Layanan yang menjalankan frontend. |
| **Supabase** | Layanan yang menjalankan database. |
| **Cron** | Alarm berulang. Mis. tiap 30 detik cek apakah ada jawaban baru yang perlu dinilai AI. |
| **WebSocket** | Saluran terbuka dua arah antara server dan browser, supaya server bisa memberi tahu tanpa ditanya lebih dulu — dipakai untuk notifikasi langsung. |
| **Webhook** | Kebalikannya: layanan luar (mis. Midtrans) yang menghubungi server kita saat ada kejadian, mis. pembayaran berhasil. |
| **Cache** | Menyimpan hasil sementara supaya pekerjaan yang sama tidak diulang. |

### Menjaga mutu

| Istilah | Artinya |
|---|---|
| **Uji satuan** (unit test) | Memeriksa satu aturan kecil secara terpisah, mis. "kuota paket Startup benar-benar 1". Cepat, jumlahnya banyak. |
| **Uji integrasi** | Memeriksa beberapa bagian bekerja sama dengan database sungguhan. Lebih lambat, jumlahnya sedikit. |
| **Uji E2E** | Menjalankan browser sungguhan dan mengklik seperti pengguna. Paling mirip kenyataan, paling lambat. |
| **Typecheck** | Pemeriksaan otomatis bahwa data yang dioper antarbagian bentuknya cocok. Menangkap salah ketik sebelum aplikasi dijalankan. |
| **Lint** | Pemeriksaan gaya dan pola berbahaya dalam kode. |
| **Coverage** | Persentase kode yang tersentuh pengujian. Angka tinggi bukan jaminan benar, angka rendah tanda risiko. |

---

## Aturan pemeliharaan dokumen

Kedelapan dokumen ini **wajib tetap sinkron dengan kode**. Dokumentasi yang salah lebih berbahaya daripada tidak ada dokumentasi: orang mengambil keputusan berdasarkan isinya.

Setiap perubahan yang menyentuh isinya diperbarui **pada saat yang sama**, bukan ditunda.

| Perubahan di kode | Dokumen yang wajib ikut berubah |
|---|---|
| Fitur, peran pengguna, aturan bisnis, harga, kuota | PRD, Changelog |
| Bagian sistem baru, penjadwalan, integrasi layanan luar | SystemArchitecture, Changelog |
| Struktur database, migrasi, data awal | DatabaseSchema, Changelog (+ PRD bila mengubah aturan) |
| Perintah API baru/berubah, aturan akses endpoint | APISpecification, Changelog |
| Pustaka atau versi perkakas | TechStack, Changelog (+ DeploymentGuide bila menambah pengaturan) |
| Berkas pengujian, konfigurasi uji, alur CI | TestingPlan, Changelog |
| Pengaturan lingkungan, konfigurasi server, langkah rilis | DeploymentGuide, Changelog |

**Changelog selalu ikut** — setiap perubahan berarti masuk entri periode berjalan.

Perubahan di repositori `frontend/` **juga** memperbarui dokumen di sini. Folder ini disimpan di repositori `backend/` supaya ikut terversi dan terbagi, bukan karena isinya khusus backend.

Setelah menarik pekerjaan orang lain (`git pull` di `backend/` atau `frontend/`), periksa commit yang masuk terhadap tabel di atas dan perbarui dokumen yang terdampak sebelum melanjutkan pekerjaan lain. Aturan lengkapnya, termasuk daftar jalur pemicu, tercatat di [`../CLAUDE.md`](../CLAUDE.md).

## Sumber yang lebih sahih dari dokumen ini

Dokumen di sini merangkum, tidak menggantikan. Bila keduanya berbeda, sumber di bawah yang benar — dan dokumennya harus diperbaiki.

| Hal | Sumber |
|---|---|
| Daftar perintah API yang persis | Swagger, halaman `GET /api/docs` (hanya aktif di luar produksi) |
| Struktur database yang persis | [`../prisma/schema.prisma`](../prisma/schema.prisma) |
| Isi pengaturan rahasia | Berkas `.env` di masing-masing repositori — **tidak pernah disalin ke dokumen mana pun** |
| Peta keterkaitan kode | `graphify-out/` (`graphify query`, `GRAPH_REPORT.md`) |
| Panduan kerja per repositori | [`../CLAUDE.md`](../CLAUDE.md) (backend), `../../frontend/CLAUDE.md` |

**Catatan jalur berkas**: di seluruh dokumen, jalur ditulis relatif terhadap direktori induk `D:\Tolongin` — mis. `backend/src/main.ts`, `frontend/next.config.ts` — bukan relatif terhadap folder dokumen ini.
