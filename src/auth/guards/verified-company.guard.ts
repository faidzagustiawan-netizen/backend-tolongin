import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class VerifiedCompanyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    if (user.role !== Role.COMPANY) {
      return true;
    }

    // Status verifikasi dibaca dari database, bukan dari klaim JWT.
    //
    // Token berumur tujuh hari (JWT_EXPIRATION default '7d'), sehingga klaim
    // `isVerified` di dalamnya salah ke dua arah: perusahaan yang baru saja
    // diverifikasi admin tetap terkunci sampai login ulang, dan perusahaan
    // yang verifikasinya dicabut tetap memegang akses penuh sampai tokennya
    // kedaluwarsa. Untuk gerbang sepenting ini, satu kueri per permintaan
    // adalah harga yang pantas.
    const account = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { isVerified: true },
    });

    if (!account) {
      throw new ForbiddenException('Akun tidak ditemukan.');
    }

    if (account.isVerified === false) {
      throw new ForbiddenException(
        'Perusahaan Anda belum diverifikasi oleh admin. Anda tidak memiliki akses ke fitur ini.',
      );
    }

    // Penanganan selanjutnya dalam permintaan yang sama ikut memakai nilai
    // segar ini, bukan klaim token yang mungkin sudah basi.
    request.user.isVerified = account.isVerified;

    return true;
  }
}
