import {
  BadRequestException,
  Controller,
  Post,
  Get,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { UpgradeSubscriptionDto } from './dto/upgrade-subscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CompanyOwnerGuard } from '../auth/guards/company-owner.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Subscription Tiers Management')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @ApiOperation({
    summary: 'Penyesuaian paket langganan secara manual (khusus Admin)',
    description:
      'Peningkatan paket oleh perusahaan sendiri hanya sah lewat pembayaran ' +
      'Midtrans (POST /payments/subscribe) yang dikonfirmasi webhook. Endpoint ' +
      'ini disediakan untuk penyesuaian manual oleh admin, misalnya kontrak ' +
      'CUSTOM atau kompensasi, dan setiap pemakaiannya tercatat di jejak audit.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paket langganan berhasil diperbarui.',
  })
  @ApiResponse({ status: 403, description: 'Akses ditolak.' })
  // Sebelumnya Role.COMPANY ikut diizinkan, sehingga perusahaan mana pun bisa
  // menaikkan paketnya sendiri ke tingkat tertinggi tanpa membayar sepeser pun
  // — seluruh verifikasi tanda tangan pada webhook Midtrans menjadi percuma.
  @Roles(Role.ADMIN)
  @Post('upgrade')
  async upgrade(@Request() req: any, @Body() dto: UpgradeSubscriptionDto) {
    return this.subscriptionsService.upgrade(dto, req.user.sub);
  }

  @ApiOperation({
    summary: 'Mendapatkan status dan masa aktif paket langganan saat ini',
  })
  @ApiResponse({
    status: 200,
    description: 'Informasi status langganan perusahaan.',
  })
  @ApiQuery({
    name: 'companyId',
    required: false,
    description: 'Wajib untuk admin; diabaikan untuk peran perusahaan',
  })
  // Masa aktif dan tingkat paket adalah urusan pemilik akun, bukan anggota tim
  // yang diundang. `CompanyOwnerGuard` sekaligus menyegarkan `profileId` di
  // request, sehingga nilai di bawah tidak lagi bergantung pada klaim token
  // berumur tujuh hari.
  @Roles(Role.COMPANY, Role.ADMIN)
  @UseGuards(CompanyOwnerGuard)
  @Get('status')
  async getStatus(@Request() req: any, @Query('companyId') companyId?: string) {
    // Token admin tidak membawa profileId. Tanpa penyelesaian eksplisit,
    // nilainya undefined dan kueri berakhir tidak menyaring apa pun.
    const targetId =
      req.user.role === Role.ADMIN ? companyId : req.user.profileId;

    if (!targetId) {
      throw new BadRequestException(
        req.user.role === Role.ADMIN
          ? 'Admin wajib menyertakan companyId.'
          : 'Sesi tidak memiliki profil perusahaan. Silakan masuk ulang.',
      );
    }

    return this.subscriptionsService.getStatus(targetId);
  }
}
