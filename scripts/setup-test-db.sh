#!/usr/bin/env bash
#
# Menyiapkan basis data lokal untuk uji integrasi (test/*.e2e-spec.ts).
#
# Pemakaian:
#   ./scripts/setup-test-db.sh
#   TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:5433/tolongin_test" \
#     npx jest --config ./test/jest-e2e.json
#
# Ubah PGHOST/PGPORT/PGUSER di bawah bila instalasi PostgreSQL Anda berbeda.
#
# ## Kenapa `db push`, bukan `migrate deploy`
#
# Alasannya BUKAN lagi riwayat migrasi yang rusak. Itu sudah diperbaiki:
# `prisma/migrations/0_init` kini membangun seluruh skema dari kosong, dan
# riwayat lama yang gagal di migrasi kedua dipindahkan ke
# `prisma/migrations-archive/`.
#
# Yang tersisa adalah alasan pgvector di bawah. `0_init` memuat
# `CREATE EXTENSION vector` beserta kolom `vector(512)`, sehingga
# `migrate deploy` gagal pada instalasi PostgreSQL yang tidak punya pgvector —
# termasuk runner CI dan kebanyakan mesin pengembang. `db push` atas salinan
# skema yang sudah dipangkas tetap jalan di mana pun.
#
# ## Kenapa kolom pgvector dibuang
#
# `talent_profiles.biometricFeatureVector` bertipe `vector(512)` dari extension
# pgvector, yang biasanya tidak terpasang pada instalasi PostgreSQL biasa. Kolom
# itu dibuang dari salinan skema yang dipakai di sini.
#
# Konsekuensinya harus diingat: basis data uji ini BUKAN replika produksi. Yang
# hilang persis satu kolom beserta indeks HNSW-nya. Uji apa pun yang menyentuh
# deduplikasi identitas biometrik TIDAK BOLEH bersandar pada basis data ini.
#
# ## Keamanan
#
# `DIRECT_URL` sengaja ditimpa saat memanggil Prisma. Tanpa itu, `prisma.config.ts`
# akan memakai nilai dari `.env` — yang menunjuk basis data produksi, dan
# `db push` di sana akan merusaknya. Skrip ini juga menolak berjalan bila URL
# tujuannya bukan localhost.
set -euo pipefail

PGHOST=${PGHOST:-127.0.0.1}
PGPORT=${PGPORT:-5433}
PGUSER=${PGUSER:-postgres}
DB=${TEST_DB_NAME:-tolongin_test}

TARGET_URL="postgresql://${PGUSER}@${PGHOST}:${PGPORT}/${DB}"

# Penjagaan terakhir: `db push` menghapus dan membuat ulang tabel, jadi salah
# tujuan berarti kehilangan data sungguhan.
case "$PGHOST" in
  127.0.0.1 | localhost | ::1) ;;
  *)
    echo "Menolak berjalan: host '$PGHOST' bukan localhost." >&2
    echo "Skrip ini menghapus dan membuat ulang tabel; hanya untuk basis data uji lokal." >&2
    exit 1
    ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_SCHEMA="$(mktemp -t schema-test-XXXXXX.prisma)"
trap 'rm -f "$TMP_SCHEMA"' EXIT

echo "== membuat ulang basis data $DB di $PGHOST:$PGPORT =="
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 \
  -qtAc "DROP DATABASE IF EXISTS $DB" >/dev/null
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 \
  -qtAc "CREATE DATABASE $DB" >/dev/null

echo "== menyusun salinan skema tanpa kolom pgvector =="
grep -v 'Unsupported("vector' "$ROOT/prisma/schema.prisma" >"$TMP_SCHEMA"

echo "== menerapkan skema =="
DIRECT_URL="$TARGET_URL" npx prisma db push \
  --schema="$TMP_SCHEMA" --accept-data-loss

echo
echo "== selesai =="
echo "Jalankan ujinya dengan:"
echo "  TEST_DATABASE_URL=\"$TARGET_URL\" npx jest --config ./test/jest-e2e.json"
