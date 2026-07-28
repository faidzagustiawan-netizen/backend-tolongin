import { Prisma } from '@prisma/client';

/**
 * Identitas penulis pesan diskusi yang aman ditampilkan.
 *
 * Sebelumnya yang dipilih adalah `email`, dan ruang diskusi bisa dibaca tanpa
 * autentikasi baik lewat `GET /challenges/:id/discussions` maupun lewat detail
 * challenge. Akibatnya alamat surel PIC perusahaan dan setiap kandidat yang
 * pernah bertanya bisa dipanen siapa pun yang tahu id challenge-nya.
 *
 * Nama tampilan diambil dari profil, bukan dari akun.
 */
export const DISCUSSION_AUTHOR_SELECT = {
  id: true,
  role: true,
  companyProfile: { select: { companyName: true, logoUrl: true, slug: true } },
  talentProfile: { select: { fullName: true, avatarUrl: true, slug: true } },
} satisfies Prisma.UserSelect;
