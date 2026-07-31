/**
 * Bidang pekerjaan disimpan sebagai relasi ke direktori `Skill`, tetapi keluar
 * dari API sebagai nama datar seperti sebelumnya.
 *
 * Klien tidak pernah butuh id bidang: yang ditampilkan, dicari, dan dikirim
 * kembali saat menyimpan semuanya nama — bentuk yang sama dengan
 * `TalentProfile.skills`. Membiarkan `{ id, name }` bocor ke respons berarti
 * setiap kartu, penyaring, dan halaman detail harus tahu bahwa kolom ini
 * berbeda sendiri dari kolom lain.
 */
export const CHALLENGE_CATEGORY_SELECT = {
  select: { name: true },
} as const;

type WithCategoryRelation = { category?: { name: string } | null };

/** Menukar relasi bidang dengan namanya, atau null bila lintas bidang. */
export function flattenCategory<T extends WithCategoryRelation>(
  row: T,
): Omit<T, 'category'> & { category: string | null } {
  const { category, ...rest } = row;
  return { ...rest, category: category?.name ?? null };
}

/** Versi daftar dari `flattenCategory`. */
export function flattenCategories<T extends WithCategoryRelation>(
  rows: T[],
): (Omit<T, 'category'> & { category: string | null })[] {
  return rows.map(flattenCategory);
}
