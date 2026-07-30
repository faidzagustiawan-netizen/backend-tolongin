import { BadRequestException } from '@nestjs/common';

/**
 * Penilaian soal psikometrik.
 *
 * Berdiri sendiri, lepas dari SubmissionsService, karena aturannya murni
 * perhitungan: tidak menyentuh basis data, tidak memanggil AI, dan hasilnya
 * harus sama persis untuk masukan yang sama. Itu juga membuatnya bisa diuji
 * tanpa menyiapkan satu pun tiruan Prisma.
 */

export const MIN_SCALE_POINTS = 3;
export const MAX_SCALE_POINTS = 7;

export type PsychometricMetadata = {
  dimension: string;
  scaleMin: number;
  scaleMax: number;
  /**
   * Soal terbalik: setuju berarti nilai dimensi rendah, bukan tinggi.
   * Dipakai untuk menahan kecenderungan menjawab setuju pada semua pernyataan.
   */
  reverse?: boolean;
};

export type PsychometricDimensionScore = {
  name: string;
  /** 0-100 hasil normalisasi, bukan penjumlahan poin. */
  score: number;
  itemCount: number;
};

export type PsychometricProfile = {
  dimensions: PsychometricDimensionScore[];
  computedAt: string;
};

/**
 * Membaca metadata soal psikometrik, atau menjelaskan apa yang salah.
 *
 * Dipakai dua kali dengan maksud berbeda: saat menerbitkan studi kasus
 * (melempar, supaya soal rusak tidak sempat terbit) dan saat menghitung profil
 * (mengabaikan yang tidak sah, supaya satu soal cacat tidak menggagalkan
 * seluruh pengumpulan yang sudah dikerjakan kandidat).
 */
export function readPsychometricMetadata(
  raw: unknown,
): { ok: true; value: PsychometricMetadata } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'pengaturan skala belum diisi' };
  }

  const meta = raw as Record<string, unknown>;

  // Bukan `String(meta.dimension ?? '')`. Nilainya `unknown`, dan `String()`
  // terhadap objek menghasilkan "[object Object]" — sebuah nama dimensi yang
  // lolos pemeriksaan "belum diisi" di bawah lalu ikut tersimpan. Hanya string
  // yang diterima; bentuk lain diperlakukan sama seperti kosong.
  const dimension =
    typeof meta.dimension === 'string' ? meta.dimension.trim() : '';

  if (!dimension) {
    return { ok: false, reason: 'nama dimensi belum diisi' };
  }

  const scaleMin = Number(meta.scaleMin);
  const scaleMax = Number(meta.scaleMax);

  if (!Number.isInteger(scaleMin) || !Number.isInteger(scaleMax)) {
    return { ok: false, reason: 'batas skala harus berupa bilangan bulat' };
  }

  const points = scaleMax - scaleMin + 1;

  if (points < MIN_SCALE_POINTS || points > MAX_SCALE_POINTS) {
    return {
      ok: false,
      reason: `skala harus memiliki ${MIN_SCALE_POINTS} sampai ${MAX_SCALE_POINTS} titik, saat ini ${points}`,
    };
  }

  return {
    ok: true,
    value: {
      dimension,
      scaleMin,
      scaleMax,
      reverse: meta.reverse === true,
    },
  };
}

/** Melempar bila metadata soal psikometrik tidak layak diterbitkan. */
export function assertPsychometricMetadata(question: string, raw: unknown) {
  const parsed = readPsychometricMetadata(raw);
  if (parsed.ok) return;

  throw new BadRequestException(
    `Soal psikotes "${question}" belum siap diterbitkan: ${parsed.reason}.`,
  );
}

/**
 * Nilai satu jawaban pada rentang 0-1.
 *
 * Jawaban di luar skala dijepit alih-alih ditolak: nilainya berasal dari
 * antarmuka yang hanya menawarkan pilihan sah, jadi yang di luar rentang
 * hampir pasti data lama setelah skalanya diubah — dan membuang seluruh
 * pengumpulan karenanya jauh lebih merugikan daripada membulatkannya.
 */
function normalize(value: number, meta: PsychometricMetadata): number {
  const span = meta.scaleMax - meta.scaleMin;
  if (span <= 0) return 0;

  const clamped = Math.min(Math.max(value, meta.scaleMin), meta.scaleMax);
  const ratio = (clamped - meta.scaleMin) / span;

  return meta.reverse ? 1 - ratio : ratio;
}

/**
 * Meringkas jawaban psikometrik menjadi profil per dimensi.
 *
 * Mengembalikan null bila tidak ada satu pun jawaban yang bisa dinilai,
 * sehingga kolom `psychometricProfile` tetap kosong untuk studi kasus yang
 * memang tidak memuat psikotes — bukan terisi profil kosong yang menyesatkan.
 */
export function computePsychometricProfile(
  answers: { metadata: unknown; value: unknown }[],
): PsychometricProfile | null {
  const buckets = new Map<string, number[]>();

  for (const answer of answers) {
    const parsed = readPsychometricMetadata(answer.metadata);
    if (!parsed.ok) continue;

    const numeric = Number(answer.value);
    if (!Number.isFinite(numeric)) continue;

    const bucket = buckets.get(parsed.value.dimension) ?? [];
    bucket.push(normalize(numeric, parsed.value));
    buckets.set(parsed.value.dimension, bucket);
  }

  if (buckets.size === 0) return null;

  const dimensions: PsychometricDimensionScore[] = Array.from(buckets.entries())
    .map(([name, ratios]) => ({
      name,
      score: Math.round(
        (ratios.reduce((acc, ratio) => acc + ratio, 0) / ratios.length) * 100,
      ),
      itemCount: ratios.length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { dimensions, computedAt: new Date().toISOString() };
}
