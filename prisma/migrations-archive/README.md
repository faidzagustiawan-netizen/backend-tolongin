# Migrasi lama (tidak dipakai lagi)

Prisma tidak membaca direktori ini. Isinya disimpan karena memuat catatan
keputusan atas data produksi — kenapa sebuah kolom dikosongkan, kenapa sebuah
nilai tidak dimigrasikan — yang masih layak dibaca meski migrasinya sendiri
sudah tidak dijalankan.

## Kenapa dipensiunkan

Riwayat ini tidak pernah bisa membangun basis data dari kosong. Dasar skemanya
dulu dibuat lewat `prisma db push`, sehingga sebagian tabel dan kolom tidak
pernah punya migrasi sendiri, sementara migrasi berikutnya tetap meng-ALTER
benda-benda itu.

Dijalankan pada basis data kosong, `prisma migrate deploy` gagal di migrasi
kedua dari tiga belas:

```
Applying migration `20260518083502_init`
Applying migration `20260727120000_add_indexes_and_invite_code_expiry`
Error: P3018
ERROR: column "inviteCode" of relation "company_profiles" does not exist
```

Ukuran selisihnya: `20260518083502_init` membuat 11 tabel, sedangkan
`schema.prisma` mendefinisikan 29 model. `challenge_sections` tidak pernah
dibuat satu pun migrasi padahal dua migrasi meng-ALTER-nya.

Penggantinya adalah `prisma/migrations/0_init/`, dihasilkan dari
`schema.prisma`. Sudah diverifikasi membangun ke-29 tabel pada basis data kosong
tanpa menyisakan selisih terhadap `schema.prisma`.

## Yang harus dilakukan pada basis data yang sudah ada

Ini termasuk kedua VPS produksi dan basis data pengembangan mana pun yang sudah
berisi skema.

**Jangan menjalankan `0_init` di sana.** Berkas itu berisi `CREATE TABLE` untuk
seluruh skema dan akan gagal — atau, lebih buruk, sebagian berhasil. Yang
diperlukan hanyalah menandainya sebagai sudah diterapkan:

```bash
prisma migrate resolve --applied 0_init
```

Perintah itu hanya menulis satu baris ke tabel `_prisma_migrations`. Tidak ada
tabel yang disentuh.

Sesudah itu, periksa apakah basis datanya memang sudah sesuai `schema.prisma`.
Riwayat lama tidak pernah dijalankan alur penyebaran — `deploy.yml` hanya
memanggil `prisma generate`, tidak pernah `migrate deploy` — jadi skema produksi
selama ini diurus manual dan selisihnya tidak diketahui:

```bash
prisma migrate diff \
  --from-config-datasource prisma.config.ts \
  --to-schema prisma/schema.prisma \
  --script
```

Keluaran kosong berarti sudah sesuai. Kalau ada isinya, itulah selisih yang
harus ditutup sebelum migrasi berikutnya bisa dipercaya. Tinjau SQL-nya dulu,
jangan langsung dijalankan.

## Menyalakan migrasi otomatis

`deploy.yml` sengaja BELUM diberi langkah `prisma migrate deploy`. Menyalakannya
sebelum baseline di atas di-resolve pada kedua VPS akan membuat setiap penyebaran
mencoba menerapkan `0_init` ke basis data yang sudah berisi tabel, lalu gagal.

Urutannya: resolve baseline di kedua mesin, pastikan `migrate diff` keluarannya
kosong, baru sisipkan langkahnya sesudah `pnpm exec prisma generate`:

```yaml
pnpm exec prisma migrate deploy
```

## Catatan bagi yang membuat ulang baseline

Dua bagian di `0_init/migration.sql` ditulis tangan dan tidak akan muncul dari
`prisma migrate diff`:

1. `CREATE EXTENSION IF NOT EXISTS vector` — kolom `biometricFeatureVector`
   bertipe `Unsupported("vector(512)")`, dan Prisma hanya menghasilkan DDL
   extension bila preview `postgresqlExtensions` aktif, yang tidak dipakai di
   sini.
2. Indeks HNSW di akhir berkas — Prisma tidak bisa mengindeks kolom
   `Unsupported`. Tanpa indeks itu pencarian tetangga terdekat untuk deduplikasi
   wajah berubah menjadi pemindaian seluruh tabel.

Keduanya disalin dari `20260727130000_pgvector_identity_dedupe` dan
`20260728080000_facenet512_embeddings` di direktori ini.
