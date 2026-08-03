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

## Status per 2026-08-03: sudah selesai untuk basis data produksi

Diperiksa dari VPS `~/backend-tolongin` terhadap Supabase produksi
(`aws-0-ap-southeast-1.pooler.supabase.com`):

- `prisma migrate status` → **5 migrations found, Database schema is up to
  date.** `0_init` sudah tercatat sebagai applied; tidak ada yang perlu
  di-`resolve` lagi.
- `prisma migrate diff --from-config-datasource prisma.config.ts --to-schema
  prisma/schema.prisma --exit-code` → **exit 0, selisih kosong.**
- `deploy.yml` sudah memakai `prisma migrate deploy`, dipasang hanya di job
  yang menyentuh `~/backend-tolongin`. Kedua VPS menunjuk basis data yang
  sama, jadi dua job yang menjalankannya berbarengan akan berebut satu tabel
  `_prisma_migrations`.

Satu jebakan yang sempat muncul dan layak diingat: pemeriksaan pertama
melaporkan selisih berupa `DROP COLUMN takenDownAt/takenDownById/
takedownReason`. Itu bukan selisih basis data melainkan kode VPS yang
tertinggal enam commit — `schema.prisma` di sana belum punya kolomnya.
Selalu `git pull` dulu sebelum mempercayai keluaran `migrate diff`.

Sisa yang belum diperiksa: VPS satunya (`~/homelab/projects/backend-tolongin`,
dijangkau lewat Tailscale). Tidak ada VPS di tailnet saat pemeriksaan ini, dan
host publik yang paling mungkin menolak koneksi karena host key SSH-nya
berubah. Bila mesin itu ternyata memakai basis data yang berbeda, ia butuh
baseline sendiri dengan langkah di bawah.

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

Sudah menyala sejak 2026-08-03, di satu job saja — lihat bagian status di atas.

Yang membuatnya boleh dinyalakan: `0_init` sudah tercatat applied dan
`migrate diff` kosong. Tanpa keduanya, setiap penyebaran akan mencoba
menerapkan `0_init` ke basis data yang sudah berisi tabel, gagal di tengah
transaksi, lalu menandai migrasinya `failed` di `_prisma_migrations` — keadaan
yang lengket dan menolak setiap `migrate deploy` berikutnya sampai
di-`resolve --rolled-back` secara manual.

Urutan yang sama berlaku untuk mesin mana pun yang memakai basis data berbeda:
resolve baseline, pastikan `migrate diff` kosong, baru sisipkan langkahnya
sesudah `pnpm exec prisma generate`:

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
