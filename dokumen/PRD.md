# PRD — Tolongin.co

**Dokumen**: Product Requirement Document
**Versi**: backend `0.0.1` · frontend `0.1.0` · analisis 2026-08-06

> **Baca [README.md](README.md) lebih dulu** bila belum. Di sana ada penjelasan produk dalam tiga paragraf dan [glosarium](README.md#glosarium) untuk istilah teknis.

> **Sifat dokumen ini**: disusun dengan membaca kode yang **sudah jalan**, bukan ditulis sebelum pembangunan. Jadi isinya menggambarkan keadaan sekarang, bukan janji ke depan. Cerita pengguna di bawah adalah rumusan ulang dari perilaku yang benar-benar ada di aplikasi. Bagian [§8 Yang belum dibangun](#8-yang-belum-dibangun) memuat hal-hal yang pernah dijanjikan tetapi tidak ada implementasinya — itu bagian paling penting bila Anda sedang menyusun rencana.

---

## 1. Masalah dan jawabannya

Perekrutan lewat CV punya cacat yang sudah lama diketahui: CV berisi klaim, bukan bukti. Perusahaan menghabiskan waktu mewawancarai orang yang ternyata tidak bisa mengerjakan pekerjaannya, dan kandidat bagus tanpa gelar atau nama besar tersaring keluar sebelum sempat menunjukkan apa pun.

| Masalah | Jawaban di Tolongin |
|---|---|
| CV tidak membuktikan kemampuan | Kandidat mengerjakan studi kasus nyata, dinilai dengan rubrik yang sama untuk semua |
| Menyaring ratusan pelamar makan waktu | AI menilai lebih dulu; perekrut hanya meninjau yang sudah bernilai |
| Ada yang menyuruh orang lain mengerjakan tes | Identitas diperiksa lewat KTP + wajah, dan dicek ulang saat ujian berlangsung |
| Ada "perusahaan" yang ternyata tidak jelas | Perusahaan wajib mengunggah dokumen legalitas dan ditinjau admin sebelum boleh merekrut |
| Hasil kerja kandidat hilang setelah proses selesai | Yang lulus jadi portofolio terverifikasi milik kandidat, bisa dipakai melamar ke mana pun |

## 2. Siapa yang memakai

Tiga jenis akun. Satu orang hanya punya satu jenis.

### Talenta — kandidat yang mencari kerja
Membuat profil, membuktikan identitas, mengerjakan studi kasus, mengumpulkan portofolio dan lencana. Bisa juga membuat studi kasus sendiri untuk umum, dengan membayar token.

### Perusahaan — yang sedang merekrut
Terbagi dua tingkat:
- **Pemilik akun** — orang yang mendaftarkan perusahaannya. Boleh mengurus tim, langganan, dan tagihan.
- **Anggota tim** — rekan kerja yang diundang lewat kode undangan. Boleh membuat dan menilai studi kasus, **tidak boleh** mengurus tim maupun langganan.

### Admin — pengelola platform
Menyetujui perusahaan, memeriksa kasus identitas yang mencurigakan, menindak pelanggaran, menjawab tiket bantuan, dan membaca laporan.

## 3. Cerita pengguna

Format: **sebagai [siapa], saya ingin [apa], sehingga [manfaatnya]** — diikuti kriteria yang menandakan fitur itu benar-benar bekerja. Semua kriteria di bawah **sudah terpenuhi di aplikasi saat ini**.

### 3.1 Masuk dan identitas

**Sebagai kandidat, saya ingin membuktikan bahwa saya benar-benar orangnya, sehingga perusahaan percaya hasil ujian saya.**

- Saya memotret KTP dan wajah saya, lalu boleh menutup halamannya — pemeriksaan berjalan di latar belakang dan hasilnya diberitahukan begitu selesai.
- Bila wajah saya cocok dengan KTP, status saya jadi **Terverifikasi**.
- Bila wajah saya ternyata sama dengan akun lain yang sudah ada, pendaftaran saya **ditolak** — satu orang hanya boleh satu akun.
- Bila kemiripannya berada di zona abu-abu (misalnya saya punya saudara kembar), akun saya tidak langsung ditolak melainkan masuk antrean untuk diperiksa manusia.
- Bila mesin pemeriksanya sedang bermasalah, pesannya berbunyi "coba lagi nanti" — **bukan** "wajah Anda tidak cocok". Kesalahan sistem tidak boleh ditimpakan kepada saya.
- Foto KTP dan selfie saya disimpan dalam keadaan terenkripsi.

**Sebagai perusahaan, saya ingin membuktikan usaha saya sah, sehingga kandidat mau mengerjakan tes dari saya.**

- Saya mengunggah nama badan usaha, nomor registrasi, dan dokumennya.
- Dokumen itu **benar-benar tersimpan dan terlihat admin** saat meninjau — bukan sekadar mengubah status.
- Sebelum disetujui, saya tidak bisa menerbitkan studi kasus.

**Sebagai pemilik akun perusahaan, saya ingin mengundang rekan kerja, sehingga tim saya bisa membantu menilai.**

- Saya membuat kode undangan yang **hanya bisa dipakai sekali** dan kedaluwarsa sendiri.
- Anggota yang bergabung masuk daftar tunggu sampai saya setujui.
- Anggota tim tidak melihat menu langganan maupun pengelolaan tim.

### 3.2 Membuat studi kasus

**Sebagai perusahaan, saya ingin menyusun ujian yang mirip pekerjaan aslinya, sehingga saya tahu kandidat mana yang benar-benar bisa.**

- Saya menyebutkan posisi yang dicari dengan kata-kata saya sendiri, dan memilih bidang pekerjaannya dari daftar.
- Bila bidang yang saya cari belum ada (misalnya "Video Editor"), saya bisa menambahkannya saat itu juga — tidak perlu menunggu siapa pun.
- Saya menyusun ujian bertahap; tiap tahap punya batas waktu dan jendela buka-tutup sendiri.
- Saya menentukan syarat lolos tiap tahap: terbuka untuk semua, nilai minimal, hanya N teratas, atau saya loloskan satu per satu.
- Selama masih draf, pekerjaan saya tersimpan otomatis — menutup browser tidak menghilangkannya.

**Sebagai perusahaan, saya ingin dibantu AI menyusun soalnya, sehingga saya tidak mulai dari halaman kosong.**

- Langkah pertama menghasilkan **kerangka** yang bisa saya baca dan ubah dulu — bukan langsung soal jadi.
- Setelah kerangkanya saya setujui, langkah kedua mengisi soal lengkapnya.
- Hasilnya berbahasa Indonesia.
- Fitur ini bagian dari paket berbayar.

**Sebagai perusahaan, saya ingin memakai ulang soal yang bagus, sehingga tidak menulis ulang tiap kali merekrut.**

- Saya memungut soal satu per satu dari bank soal — bukan menyalin satu ujian utuh.
- Ada bank soal bersama milik platform, dan koleksi pribadi yang hanya saya lihat.
- Soal yang saya sunting di koleksi **tidak** mengubah ujian yang sedang dikerjakan kandidat.
- Soal yang saya tarik dari peredaran tidak merusak ujian yang sudah memakainya.

### 3.3 Mengerjakan ujian

**Sebagai kandidat, saya ingin waktu pengerjaan yang adil, sehingga saya tidak dirugikan hal di luar kendali saya.**

- Waktu mulai dihitung saat saya menekan "Mulai Tahap" — bukan saat halamannya termuat.
- Hitungan yang menentukan ada di server; memundurkan jam di komputer saya tidak menambah waktu.
- Jawaban saya tersimpan otomatis ke server selama mengerjakan.
- Bila waktu habis sebelum saya mengumpulkan, jawaban yang sudah tersimpan **tetap dinilai**, tidak hangus.
- Bila tahap berikutnya terkunci, saya diberi tahu **alasannya** dengan kalimat yang bisa dibaca, bukan sekadar ikon gembok.
- Bila nilai saya belum keluar karena penilaiannya terlambat, ada kebijakan yang menentukan apa yang terjadi — termasuk kemungkinan tahap berikutnya terbuka otomatis setelah tenggang tertentu, supaya saya tidak terjebak menunggu selamanya.

**Sebagai kandidat, saya ingin menjawab dengan cara yang sesuai soalnya.**

Tersedia tujuh jenis soal: pilihan ganda, esai, unggah berkas, unggah video, kirim tautan, tulis kode langsung di aplikasi, dan skala psikotes.

**Sebagai perusahaan, saya ingin yakin yang mengerjakan adalah orangnya sendiri.**

- Wajah kandidat dicek ulang saat ujian berjalan, dibandingkan dengan foto verifikasi awal.
- Pengaturan pengawasan diatur per studi kasus.
- Pada studi kasus berpengawasan, kandidat yang **belum terverifikasi KTP** tidak bisa memulai pengerjaan sama sekali: tombol mulai dan pembuka kamera menampilkan ajakan verifikasi ke `/settings/kyc`. Sebelumnya keadaan ini hanya berupa peringatan kuning yang bisa diabaikan — pencocokan biometrik lalu berjalan tanpa foto pembanding.

### 3.4 Penilaian dan keputusan

**Sebagai perusahaan, saya ingin sebagian penilaian otomatis, sehingga saya hanya membaca yang layak dibaca.**

- Pilihan ganda dinilai langsung.
- AI memberi nilai awal, ringkasan koreksi, dugaan plagiarisme, catatan soft skill, dan daftar kelemahan.
- Jawaban psikotes **tidak** ikut menentukan nilai — skala Likert tidak punya jawaban benar. Hasilnya disajikan terpisah sebagai profil per dimensi.
- Nilai akhir tetap keputusan manusia; saya bisa menimpanya dan menulis ulasan.

**Sebagai kandidat, saya ingin proses saya tidak menggantung.**

Bila perusahaan belum meninjau setelah 7 hari, sistem mengingatkan mereka — sekali per submisi, bukan setiap hari berulang-ulang.

**Sebagai perusahaan, saya ingin menandai posisi kandidat dalam proses rekrutmen.**

Status rekrutmen terpisah dari nilai: belum diproses, masuk daftar pendek, diundang wawancara, diterima, atau ditolak. Kontak kandidat baru terbuka pada tahap tertentu.

### 3.5 Setelah lulus

**Sebagai kandidat, saya ingin hasil kerja saya tetap berguna setelah prosesnya selesai.**

- Submisi yang lulus bisa saya jadikan portofolio publik dengan penanda terverifikasi.
- Saya mendapat XP dan lencana atas pencapaian saya.
- Lencana mengukur hal yang benar-benar berbeda: jumlah kelulusan, kelulusan bernilai tinggi, keluasan bidang, identitas terverifikasi, kontribusi diskusi, jumlah diterima kerja, dan lainnya — **bukan** satu angka XP yang diberi nama berbeda-beda.
- **Bila studi kasusnya diturunkan admin karena perusahaannya melanggar, portofolio dan nilai saya tetap utuh.** Hukuman untuk perusahaan tidak jatuh ke kandidatnya.

### 3.6 Pengelolaan platform

**Sebagai admin, saya ingin menindak pelanggaran tanpa merugikan pihak yang tidak bersalah.**

- Menurunkan studi kasus **menyembunyikannya**, tidak menghapusnya. Submisi, penilaian, dan portofolio kandidat selamat.
- Hanya admin yang bisa mengembalikannya.
- Setiap tindakan saya tercatat di log audit.

**Sebagai admin, saya ingin memutuskan kasus identitas yang meragukan.**

Ada antrean berisi akun yang kemiripan wajahnya masuk zona abu-abu, lengkap dengan angka kemiripannya, untuk saya putuskan.

## 4. Aturan yang ditegakkan sistem

Bukan kebijakan di atas kertas — semuanya benar-benar dijalankan kode.

| Aturan | Rincian |
|---|---|
| Satu orang satu akun | Wajah dan nomor KTP tidak boleh dipakai dua akun |
| Perusahaan wajib lolos pemeriksaan legalitas | Sebelum itu, tidak bisa membuat atau menerbitkan studi kasus |
| Batas waktu ditentukan server | Pengumpulan lewat batas waktu ditolak |
| Penurunan studi kasus tidak menghapus | Karya kandidat selamat dari sanksi terhadap perusahaan |
| Token dipotong bersama pekerjaannya | Bila pembuatan studi kasus gagal, token kembali sendiri — tidak ada saldo hilang sia-sia |
| Perintah pengisi data contoh dijaga dua lapis | Perintah itu mengosongkan tabel; wajib admin **dan** dimatikan di server produksi |

## 5. Harga dan kuota

Angka di bawah yang **benar-benar ditagih dan ditegakkan** sistem.

| Paket | Harga | Yang didapat |
|---|---|---|
| **Startup** | Rp 500.000/bulan (Rp 0 selama belum berlangganan) | 1 studi kasus aktif atau draf · pembuatan manual · penilaian oleh tim sendiri |
| **Pro** | Rp 2.500.000/bulan | 5 studi kasus aktif atau draf · pembuatan dibantu AI · penilaian AI otomatis · deteksi plagiarisme dan soft skill · pengawasan biometrik penuh |
| **Custom** | Hubungi sales | Kuota sesuai kesepakatan · seluruh fitur Pro · kustomisasi tampilan · dukungan khusus |

**Token untuk kandidat**: membuat satu studi kasus publik = **50 token**, maksimum **3** yang aktif atau berstatus draf sekaligus.

> **Penting**: penegakan batas paket **sedang dimatikan** selama masa pengembangan, di sisi tampilan dan sisi server sekaligus. Artinya semua fitur bisa dicoba tanpa membayar. Menyalakannya kembali cukup mengubah satu pengaturan di kedua sisi — tidak ada kode yang perlu disentuh.

## 6. Yang penting tapi tidak terlihat pengguna

| Aspek | Keadaan sekarang |
|---|---|
| Kecepatan | Batas 100 permintaan per menit **per orang** — bukan per alamat internet, supaya fitur mahal seperti generator AI tidak habis dipakai satu orang di jaringan bersama |
| Ukuran unggahan | Maksimum 5 MB per permintaan |
| Pemantauan | Galat dan performa dilaporkan otomatis ke layanan pemantauan |
| Batas mesin | Server produksi hanya 2 inti / 2 GB memori. Pemeriksa wajah sengaja dijalankan satu proses saja — dua proses memakan ~1,45 GB dan saling berebut |
| Privasi biometrik | Data wajah tersimpan dengan cara yang membuatnya **tidak mungkin** ikut terbawa ke jawaban API, bahkan karena kelalaian |
| Bahasa | Seluruh antarmuka, pesan galat, dan keluaran AI berbahasa Indonesia |

## 7. Alur singkat tiap peran

**Kandidat**
Daftar → lengkapi profil → verifikasi identitas → cari studi kasus → daftar ikut → kerjakan tahap demi tahap → kumpulkan → AI menilai → perusahaan meninjau → lulus → portofolio, XP, lencana

**Perusahaan**
Daftar → unggah dokumen legalitas → tunggu persetujuan admin → pilih paket → susun studi kasus → atur tahap dan syarat lolos → terbitkan → pantau submisi masuk → nilai → tandai status rekrutmen → buka kontak kandidat

**Admin**
Masuk → antrean perusahaan menunggu persetujuan → antrean identitas meragukan → moderasi studi kasus → log audit → tiket bantuan dan pengumuman

## 8. Yang belum dibangun

Bagian ini sengaja diletakkan di badan dokumen, bukan catatan kaki. Semua di bawah **tidak ada implementasinya** — jangan menjanjikannya kepada pengguna.

| Pernah disebut | Kenyataan |
|---|---|
| "Studi kasus tak terbatas" | Tidak ada; kuota nyatanya 1 dan 5 |
| "Submisi kandidat tak terbatas" | Tidak ada batas kandidat sama sekali di sistem — baik atas maupun bawah |
| "Maksimal 50/500 kandidat per tantangan" | Tidak ada logikanya |
| "Uji coba gratis 14 hari" | Tidak ada logika uji coba di mana pun |
| Top-up token di menu token | Masih **simulasi** — saldo bertambah tanpa pembayaran nyata. Jalur berbayar sungguhan ada di menu pembayaran |

Catatan lain:
- Berkas `saas_churn_dataset.csv` dan `generate_churn_dataset.py` di direktori induk adalah data buatan untuk eksperimen prediksi berhenti langganan. **Tidak tersambung ke aplikasi** — jangan dianggap fitur.
- Nomor WhatsApp sales di halaman paket ditulis `0895...`. WhatsApp menuntut format internasional tanpa nol di depan (`62895...`), jadi tautan itu kemungkinan besar tidak pernah membuka percakapan. Hanya pemiliknya yang tahu digit yang benar.

## 9. Ukuran keberhasilan

Semua bisa dihitung dari data yang sudah dicatat sistem, tanpa menambah pelacakan baru:

- Berapa persen yang mendaftar ujian akhirnya lulus.
- Berapa lama perusahaan meninjau, dibanding target 7 hari.
- Berapa banyak yang masuk daftar pendek akhirnya diterima kerja.
- Berapa persen verifikasi identitas berhasil, dan berapa yang butuh diperiksa manusia.
- Berapa banyak kuota paket yang benar-benar terpakai — penanda apakah harga dan kuotanya masuk akal.
