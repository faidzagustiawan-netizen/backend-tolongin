import { defineConfig } from '@prisma/config';
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  migrations: {
    seed: 'npx ts-node -r tsconfig-paths/register prisma/seed.ts',
  },
  datasource: {
    // Sengaja DIRECT_URL, bukan DATABASE_URL.
    //
    // Sejak Prisma 7, `directUrl` bukan lagi kunci yang sah di sini dan
    // nilainya diabaikan diam-diam — satu-satunya tanda adalah galat
    // TypeScript "directUrl does not exist". Akibatnya CLI jatuh ke
    // DATABASE_URL yang menunjuk pooler transaksi Supabase (port 6543), dan
    // migrasi gagal dengan `prepared statement "s1" already exists` karena
    // pooler mode transaksi tidak mendukung prepared statement.
    //
    // Kunci `url` di berkas ini HANYA dipakai Prisma CLI untuk migrasi, jadi
    // isinya harus koneksi langsung (port 5432). Runtime aplikasi tidak
    // membacanya sama sekali — PrismaService membangun poolnya sendiri dari
    // process.env.DATABASE_URL, sehingga lalu lintas aplikasi tetap lewat
    // pooler seperti seharusnya.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
