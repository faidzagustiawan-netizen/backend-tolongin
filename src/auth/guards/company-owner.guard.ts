import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Membatasi sebuah endpoint kepada pemilik akun perusahaan.
 *
 * Pemilik adalah akun yang mendaftarkan perusahaannya sendiri, sehingga
 * memiliki baris `CompanyProfile`. Akun yang masuk lewat kode undangan tidak
 * pernah memilikinya — keanggotaannya tercatat di `CompanyMember`.
 *
 * Sebelumnya pembedanya adalah klaim `isTeamMember` di dalam token, dan itu
 * salah untuk anggota yang belum disetujui: nilainya `!!approvedMembership &&
 * !companyProfile`, sehingga anggota berstatus PENDING mendapat `false` — nilai
 * yang sama dengan pemilik — dan lolos dari setiap pemeriksaan `if
 * (isTeamMember)`. Yang menahannya hanyalah `resolveCompanyScope` yang kebetulan
 * melempar 400 karena `profileId` ikut kosong; endpoint yang tidak memakainya,
 * seperti `POST /payments/subscribe`, sama sekali tidak terlindungi.
 *
 * Kepemilikan karena itu dibaca dari basis data, bukan dari klaim token yang
 * berumur tujuh hari. Sekalian nilai `profileId` di request disegarkan, supaya
 * penanganan berikutnya tidak memakai klaim yang mungkin sudah basi.
 */
@Injectable()
export class CompanyOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // Admin mengelola perusahaan mana pun; cakupannya ditentukan lewat
    // parameter companyId yang eksplisit, bukan lewat kepemilikan profil.
    if (user.role === Role.ADMIN) {
      return true;
    }

    if (user.role !== Role.COMPANY) {
      throw new ForbiddenException(
        'Akses ditolak: Anda tidak memiliki izin untuk fitur ini',
      );
    }

    const profile = await this.prisma.companyProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });

    if (!profile) {
      throw new ForbiddenException(
        'Aksi ini hanya dapat dilakukan oleh Owner perusahaan.',
      );
    }

    request.user.profileId = profile.id;
    request.user.isCompanyOwner = true;

    return true;
  }
}
