import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { COMPANY_ROLES_KEY } from '../decorators/company-roles.decorator';

/**
 * Menegakkan peran anggota di dalam ruang kerja perusahaan.
 *
 * `CompanyMember.role` sudah lama menyimpan OWNER / ADMIN / RECRUITER, tetapi
 * tidak ada satu pun pemeriksaan yang membacanya: semua anggota tim menerima
 * `profileId` perusahaan yang sama, sehingga seorang rekruter punya kuasa
 * setara pemilik. Kolomnya sekadar hiasan.
 *
 * Perannya dibaca dari database, bukan dari klaim JWT. Token berumur tujuh
 * hari, dan penurunan peran yang baru saja dilakukan tidak boleh menunggu
 * selama itu untuk berlaku.
 */
@Injectable()
export class CompanyRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      COMPANY_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.sub) return false;

    // Admin platform memoderasi lintas perusahaan; peran ruang kerja tidak
    // berlaku baginya.
    if (user.role === Role.ADMIN) return true;

    const companyRole = await this.resolveCompanyRole(user.sub);

    if (!companyRole || !requiredRoles.includes(companyRole)) {
      throw new ForbiddenException(
        `Tindakan ini hanya untuk ${requiredRoles.join(' atau ')} ruang kerja perusahaan.`,
      );
    }

    return true;
  }

  private async resolveCompanyRole(userId: string): Promise<string | null> {
    // Pemegang akun perusahaan adalah pemiliknya, meski tidak punya baris di
    // CompanyMember — begitulah akun yang dibuat lewat pendaftaran biasa.
    const ownedCompany = await this.prisma.companyProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (ownedCompany) return 'OWNER';

    const membership = await this.prisma.companyMember.findUnique({
      where: { userId },
      select: { role: true },
    });

    return membership?.role ?? null;
  }
}
