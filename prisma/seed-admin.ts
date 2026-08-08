/**
 * Membuat (atau memperbarui) satu akun admin.
 *
 * Kenapa ini terpisah dari `SeedService`. Endpoint `POST /seed` dijaga
 * `@Roles(Role.ADMIN)`, sementara satu-satunya yang membuat akun admin adalah
 * seeder itu sendiri — pada basis data tanpa admin, tidak ada seorang pun yang
 * bisa memanggilnya. Skrip ini memutus lingkaran itu dari baris perintah.
 *
 * Berbeda dari `SeedService`, skrip ini **tidak menghapus apa pun**: tidak ada
 * TRUNCATE, tidak ada deleteMany. Aman dijalankan pada basis data pengembangan
 * yang sedang dipakai orang lain, dan aman diulang — akun yang sudah ada hanya
 * disetel ulang kata sandi dan perannya.
 *
 * Jalankan: pnpm run seed:admin
 *
 * Kata sandi diambil dari `SEED_ADMIN_PASSWORD` bila ada. Tanpa variabel itu,
 * skrip memakai sandi pengembangan bawaan — dan menolak berjalan ketika
 * `NODE_ENV=production`, karena akun admin bersandi tetap yang diketahui publik
 * mengubah salah jalan menjadi pengambilalihan platform.
 */
import { PrismaClient, Role } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@tolongin.co';
const DEV_PASSWORD = 'AdminPassword123';

async function main() {
  const fromEnv = process.env.SEED_ADMIN_PASSWORD;

  if (!fromEnv && process.env.NODE_ENV === 'production') {
    throw new Error(
      'NODE_ENV=production: setel SEED_ADMIN_PASSWORD dulu. Sandi bawaan pengembangan ditolak di produksi.',
    );
  }

  const password = fromEnv || DEV_PASSWORD;
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, role: Role.ADMIN, isVerified: true },
    create: {
      email: EMAIL,
      passwordHash,
      fullName: 'Admin Tolongin',
      role: Role.ADMIN,
      isVerified: true,
    },
  });

  console.log(`Akun admin siap: ${admin.email}`);
  if (!fromEnv) {
    console.log(`Kata sandi pengembangan: ${DEV_PASSWORD}`);
  } else {
    console.log('Kata sandi diambil dari SEED_ADMIN_PASSWORD.');
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
