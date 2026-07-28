import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ThrottlerGuard yang menghitung kuota per pengguna, bukan per alamat IP.
 *
 * Pembatasan berbasis IP salah sasaran untuk endpoint yang mahal namun
 * terautentikasi: satu kantor atau satu operator seluler berbagi IP, sehingga
 * kuota ketat akan memblokir orang yang tidak melakukan apa-apa, sementara
 * satu penyalahguna cukup berpindah jaringan untuk mengulang dari nol.
 *
 * Permintaan tanpa token tetap dihitung per IP seperti sebelumnya.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = req.user?.sub;
    return userId ? `user:${userId}` : `ip:${req.ip}`;
  }
}
