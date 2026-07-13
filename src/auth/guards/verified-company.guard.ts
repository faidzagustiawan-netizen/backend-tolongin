import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

@Injectable()
export class VerifiedCompanyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    if (user.role === Role.COMPANY && user.isVerified === false) {
      throw new ForbiddenException('Perusahaan Anda belum diverifikasi oleh admin. Anda tidak memiliki akses ke fitur ini.');
    }

    return true;
  }
}
