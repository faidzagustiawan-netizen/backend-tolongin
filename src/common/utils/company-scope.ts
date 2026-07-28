import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';

/**
 * Menentukan perusahaan mana yang sedang dilihat oleh pemanggil.
 *
 * Endpoint ruang kerja perusahaan mengizinkan peran ADMIN lewat @Roles, tetapi
 * token admin tidak membawa `profileId` — admin bukan perusahaan maupun
 * talenta. Nilai undefined itu dulu diteruskan apa adanya ke Prisma, dan
 * `where: { companyId: undefined }` membuat Prisma **membuang syaratnya**:
 * kueri lalu mengembalikan baris milik seluruh perusahaan. Untuk daftar
 * anggota tim, jejak audit, dan submisi kandidat, itu berarti kebocoran lintas
 * penyewa.
 *
 * Admin karena itu wajib menyebut perusahaan tujuannya secara eksplisit.
 */
export function resolveCompanyScope(
  user: { role?: string; profileId?: string } | undefined,
  explicitCompanyId?: string,
): string {
  const isAdmin = user?.role === Role.ADMIN;
  const companyId = isAdmin ? explicitCompanyId : user?.profileId;

  if (!companyId) {
    throw new BadRequestException(
      isAdmin
        ? 'Admin wajib menyertakan companyId untuk melihat data ruang kerja perusahaan.'
        : 'Sesi tidak memiliki profil perusahaan. Silakan masuk ulang.',
    );
  }

  return companyId;
}
