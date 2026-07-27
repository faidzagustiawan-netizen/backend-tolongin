import { ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Versi longgar dari JwtAuthGuard: permintaan tanpa token tetap diizinkan,
 * tetapi permintaan yang MEMBAWA token melalui pemeriksaan yang sama persis
 * (tanda tangan, akun ada, tidak di-ban, peran diambil dari basis data).
 *
 * Sebelumnya guard ini hanya memverifikasi tanda tangan, sehingga akun yang
 * sudah di-ban masih dianggap terautentikasi pada endpoint semi-publik.
 */
@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const hasToken = request.headers?.authorization?.startsWith('Bearer ');

    if (!hasToken) {
      return true;
    }

    try {
      return await super.canActivate(context);
    } catch {
      // Token bermasalah diperlakukan sebagai tamu, bukan sebagai galat.
      delete request.user;
      return true;
    }
  }
}
