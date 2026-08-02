/**
 * Enam bidang pekerjaan yang dulu menjadi enum `ChallengeCategory`.
 *
 * Sekarang bidang adalah baris biasa di direktori `skills` dan boleh bertambah
 * kapan saja, jadi daftar ini bukan lagi himpunan nilai yang sah — perannya
 * tinggal dua: menerjemahkan kode enum lama di berkas semai, dan memastikan
 * pemasangan yang benar-benar baru tidak dimulai dari direktori kosong.
 */
export const LEGACY_JOB_CATEGORY_NAMES = {
  FRONTEND: 'Frontend Development',
  BACKEND: 'Backend Development',
  UI_UX: 'UI/UX Design',
  DATA_SCIENCE: 'Data Science / ML',
  MARKETING: 'Digital Marketing',
  PRODUCT: 'Product Management',
} as const;

export type LegacyJobCategoryCode = keyof typeof LEGACY_JOB_CATEGORY_NAMES;
