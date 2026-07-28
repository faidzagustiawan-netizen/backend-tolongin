import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface CachedAccount {
  role: Role;
  isBanned: boolean;
  expiresAt: number;
}

/**
 * Umur cache status akun. Token berlaku 7 hari, sehingga tanpa pemeriksaan
 * ulang ke basis data seorang pengguna yang di-ban tetap punya akses penuh
 * selama sisa masa token. Cache pendek ini menekan biaya query sekaligus
 * membuat pemblokiran berlaku dalam hitungan detik, bukan hari.
 */
const ACCOUNT_CACHE_TTL_MS = 30_000;

/** Ambang pembersihan cache agar Map tidak tumbuh tanpa batas. */
const ACCOUNT_CACHE_MAX_ENTRIES = 10_000;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly accountCache = new Map<string, CachedAccount>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Akses ditolak: Token tidak ditemukan');
    }

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException(
        'Akses ditolak: Token tidak valid atau kedaluwarsa',
      );
    }

    const account = await this.resolveAccount(payload?.sub);

    if (!account) {
      throw new UnauthorizedException('Akses ditolak: Akun tidak ditemukan');
    }

    if (account.isBanned) {
      this.accountCache.delete(payload.sub);
      throw new UnauthorizedException(
        'Akun Anda telah ditangguhkan (Banned). Silakan hubungi admin.',
      );
    }

    // Peran diambil dari basis data, bukan dari isi token. Penurunan peran
    // (misal ADMIN menjadi TALENT) harus langsung berlaku tanpa menunggu
    // token lama kedaluwarsa.
    request['user'] = { ...payload, role: account.role };

    return true;
  }

  private async resolveAccount(userId?: string): Promise<CachedAccount | null> {
    if (!userId) return null;

    const cached = this.accountCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isBanned: true },
    });

    if (!user) {
      this.accountCache.delete(userId);
      return null;
    }

    if (this.accountCache.size >= ACCOUNT_CACHE_MAX_ENTRIES) {
      this.pruneExpired();
    }

    const entry: CachedAccount = {
      role: user.role,
      isBanned: user.isBanned,
      expiresAt: Date.now() + ACCOUNT_CACHE_TTL_MS,
    };
    this.accountCache.set(userId, entry);

    return entry;
  }

  private pruneExpired() {
    const now = Date.now();
    for (const [key, value] of this.accountCache) {
      if (value.expiresAt <= now) {
        this.accountCache.delete(key);
      }
    }
    // Kalau semuanya masih segar, kosongkan saja: entri akan terisi ulang
    // pada permintaan berikutnya dan batas memori tetap terjaga.
    if (this.accountCache.size >= ACCOUNT_CACHE_MAX_ENTRIES) {
      this.accountCache.clear();
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
