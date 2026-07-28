/**
 * Mengisi ulang embedding wajah untuk profil yang sudah terverifikasi.
 *
 * Diperlukan karena:
 *   1. Kolom lama bertipe JSON dan diisi dari peramban, sehingga dibuang saat
 *      migrasi ke pgvector.
 *   2. Profil yang terverifikasi sebelum perbaikan alignment tidak punya
 *      embedding yang layak dibandingkan.
 *
 * Skrip ini juga mencetak sebaran jarak tetangga terdekat. Angka itulah yang
 * dipakai untuk menetapkan IDENTITY_DEDUPE_REJECT_DISTANCE dan
 * IDENTITY_DEDUPE_REVIEW_DISTANCE — jangan menebak ambang tanpa data ini.
 *
 * Cara pakai:
 *   1. Pastikan APP_SECRET sudah benar (foto tersimpan dalam keadaan terenkripsi)
 *   2. npx ts-node -r tsconfig-paths/register scripts/backfill-biometric-vectors.ts
 *   3. Tambahkan --apply untuk benar-benar menulis; tanpa itu hanya laporan
 *
 * Aman diulang.
 */
import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import * as path from 'path';
import { EncryptionUtil } from '../src/utils/encryption.util';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
// Harus sama dengan lebar kolom pgvector dan keluaran model di verify_face.py.
const EMBEDDING_DIMENSIONS = 512;

interface FaceScriptResult {
  isMatch: boolean;
  featureVector: number[] | null;
  alignmentDegraded: boolean;
  reason: string;
}

function runFaceScript(selfieDataUrl: string): Promise<FaceScriptResult> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(
      process.cwd(),
      'src/ai/python/verify_face.py',
    );
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    const child = exec(
      `${pythonCmd} "${scriptPath}"`,
      {
        maxBuffer: 1024 * 1024 * 50,
        env: {
          ...process.env,
          CUDA_VISIBLE_DEVICES: '-1',
          TF_CPP_MIN_LOG_LEVEL: '3',
        },
      },
      (error, stdout) => {
        try {
          const match = stdout.match(
            /===JSON_START===\s*([\s\S]*?)\s*===JSON_END===/,
          );
          resolve(JSON.parse(match?.[1] ?? stdout.trim()));
        } catch (e: any) {
          reject(new Error(error?.message || e.message));
        }
      },
    );

    // Selfie dibandingkan dengan dirinya sendiri: yang dibutuhkan hanya
    // embedding-nya, bukan hasil pencocokan dengan KTP.
    child.stdin!.write(
      JSON.stringify({
        selfiePhotoUrl: selfieDataUrl,
        idCardPhotoUrl: selfieDataUrl,
      }),
    );
    child.stdin!.end();
  });
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.map((v) => Number(v).toFixed(8)).join(',')}]`;
}

async function main() {
  const profiles = await prisma.talentProfile.findMany({
    where: {
      faceVerificationStatus: 'VERIFIED',
      encryptedPrivateFace: { not: null },
    },
    select: { id: true, fullName: true, encryptedPrivateFace: true },
  });

  console.log(
    `${profiles.length} profil terverifikasi ditemukan. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`,
  );

  let written = 0;
  let degraded = 0;
  let failed = 0;
  const distances: { id: string; distance: number; matchId: string }[] = [];

  for (const profile of profiles) {
    try {
      const selfie = EncryptionUtil.decrypt(profile.encryptedPrivateFace!);
      const result = await runFaceScript(selfie);

      if (
        !result.featureVector ||
        result.featureVector.length !== EMBEDDING_DIMENSIONS
      ) {
        degraded++;
        console.warn(
          `  [lewati] ${profile.id} (${profile.fullName}): wajah tidak ter-align — ${result.reason}`,
        );
        continue;
      }

      const literal = toVectorLiteral(result.featureVector);

      // Jarak dihitung SEBELUM baris ini ditulis, supaya tidak menemukan
      // dirinya sendiri sebagai tetangga terdekat.
      const nearest = await prisma.$queryRaw<
        { id: string; distance: number }[]
      >`
        SELECT "id", ("biometricFeatureVector" <=> ${literal}::vector) AS distance
        FROM "talent_profiles"
        WHERE "biometricFeatureVector" IS NOT NULL
          AND "id" <> ${profile.id}
        ORDER BY "biometricFeatureVector" <=> ${literal}::vector
        LIMIT 1
      `;

      if (nearest[0]) {
        distances.push({
          id: profile.id,
          distance: Number(nearest[0].distance),
          matchId: nearest[0].id,
        });
      }

      if (APPLY) {
        await prisma.$executeRaw`
          UPDATE "talent_profiles"
          SET "biometricFeatureVector" = ${literal}::vector,
              "faceAlignmentDegraded" = false
          WHERE "id" = ${profile.id}
        `;
      }
      written++;
    } catch (error: any) {
      failed++;
      console.error(`  [gagal] ${profile.id}: ${error.message}`);
    }
  }

  console.log(
    `\nSelesai. Ditulis: ${written}, dilewati (tidak ter-align): ${degraded}, gagal: ${failed}.`,
  );

  if (distances.length > 0) {
    const sorted = [...distances].sort((a, b) => a.distance - b.distance);
    const at = (p: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
        .distance;

    console.log('\n--- Sebaran jarak ke tetangga terdekat ---');
    console.log(`  minimum   : ${sorted[0].distance.toFixed(4)}`);
    console.log(`  persentil 1 : ${at(0.01).toFixed(4)}`);
    console.log(`  persentil 5 : ${at(0.05).toFixed(4)}`);
    console.log(`  median    : ${at(0.5).toFixed(4)}`);
    console.log(
      '\nPasangan paling mirip (periksa manual apakah benar orang yang sama):',
    );
    for (const row of sorted.slice(0, 10)) {
      console.log(
        `  ${row.distance.toFixed(4)}  ${row.id}  <->  ${row.matchId}`,
      );
    }
    console.log(
      '\nTetapkan IDENTITY_DEDUPE_REJECT_DISTANCE di bawah jarak pasangan sah terdekat,',
    );
    console.log(
      'dan IDENTITY_DEDUPE_REVIEW_DISTANCE sedikit di atasnya. Jangan aktifkan',
    );
    console.log('IDENTITY_DEDUPE_MODE=enforce sebelum angka ini diperiksa.');
  }

  if (!APPLY) {
    console.log('\nDRY-RUN: tidak ada yang ditulis. Tambahkan --apply.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
