/**
 * Enkripsi ulang data identitas talenta dari kunci bawaan lama ke APP_SECRET.
 *
 * Latar belakang: sebelum APP_SECRET diwajibkan, encryptedKtpData dan
 * encryptedPrivateFace dienkripsi memakai konstanta yang tertulis di source
 * code. Kunci itu ada di riwayat repo, jadi seluruh baris yang ditulis pada
 * masa itu harus dianggap terekspos dan wajib dienkripsi ulang.
 *
 * Cara pakai:
 *   1. Set APP_SECRET (minimal 32 karakter) di .env
 *   2. Set ALLOW_LEGACY_DECRYPT=true
 *   3. npx ts-node -r tsconfig-paths/register scripts/reencrypt-identity-data.ts
 *   4. Hapus kembali ALLOW_LEGACY_DECRYPT dari .env
 *
 * Skrip ini aman diulang: baris yang sudah memakai kunci baru dilewati.
 */
import { PrismaClient } from '@prisma/client';
import { EncryptionUtil } from '../src/utils/encryption.util';

const prisma = new PrismaClient();

const FIELDS = ['encryptedKtpData', 'encryptedPrivateFace'] as const;

async function main() {
  if (process.env.ALLOW_LEGACY_DECRYPT !== 'true') {
    throw new Error(
      'Set ALLOW_LEGACY_DECRYPT=true sebelum menjalankan skrip ini.',
    );
  }

  const profiles = await prisma.talentProfile.findMany({
    where: {
      OR: [
        { encryptedKtpData: { not: null } },
        { encryptedPrivateFace: { not: null } },
      ],
    },
    select: {
      id: true,
      encryptedKtpData: true,
      encryptedPrivateFace: true,
    },
  });

  console.log(`Memeriksa ${profiles.length} profil dengan data identitas...`);

  let rewritten = 0;
  let skipped = 0;
  let failed = 0;

  for (const profile of profiles) {
    const updates: Record<string, string> = {};

    for (const field of FIELDS) {
      const value = profile[field];
      if (!value) continue;

      try {
        // Jika sudah memakai kunci baru, dekripsi berhasil tanpa peringatan
        // dan hasil enkripsi ulangnya tetap setara — tetap ditulis ulang agar
        // IV baru dibuat, yang tidak merugikan.
        const plain = EncryptionUtil.decrypt(value);
        updates[field] = EncryptionUtil.encrypt(plain);
      } catch (error: any) {
        console.error(
          `  Gagal memproses ${field} pada profil ${profile.id}: ${error.message}`,
        );
        failed++;
      }
    }

    if (Object.keys(updates).length === 0) {
      skipped++;
      continue;
    }

    await prisma.talentProfile.update({
      where: { id: profile.id },
      data: updates,
    });
    rewritten++;
  }

  console.log(
    `Selesai. Ditulis ulang: ${rewritten}, dilewati: ${skipped}, gagal: ${failed}.`,
  );

  if (failed > 0) {
    console.warn(
      'Ada baris yang gagal. Periksa manual sebelum mematikan ALLOW_LEGACY_DECRYPT.',
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
