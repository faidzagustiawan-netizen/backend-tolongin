import {
  Controller,
  Post,
  Body,
  Request,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CompanyOwnerGuard } from '../auth/guards/company-owner.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CreateTopupDto } from './dto/create-topup.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

@ApiTags('Payment Gateway (Midtrans)')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TALENT)
  @ApiOperation({ summary: 'Top-up token untuk Talent' })
  @Post('topup')
  async createTopup(@Request() req: any, @Body() dto: CreateTopupDto) {
    return this.paymentsService.createTokenTopup(
      req.user.sub,
      req.user.email,
      dto.tokenAmount,
    );
  }

  // Hanya pemilik perusahaan yang boleh membelanjakan uang perusahaan.
  //
  // Sebelumnya `@Roles(Role.COMPANY)` berdiri sendiri, sehingga akun undangan
  // pun bisa memulai pembayaran. Akibatnya bukan sekadar izin: webhook
  // mengaktifkan langganan lewat `companyProfile where userId`, dan akun
  // undangan tidak punya baris itu — uangnya tertagih, paketnya tidak pernah
  // aktif.
  //
  // `VerifiedCompanyGuard` sengaja tidak dipasang di sini selama pengembangan:
  // menuntut persetujuan admin lebih dulu membuat alur pembayaran tidak bisa
  // dicoba sama sekali. Pasang kembali bila pembelian paket memang harus
  // menunggu legalitas disetujui.
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, RolesGuard, CompanyOwnerGuard)
  @Roles(Role.COMPANY)
  @ApiOperation({ summary: 'Berlangganan paket Premium untuk Company' })
  @Post('subscribe')
  async createSubscription(
    @Request() req: any,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.paymentsService.createSubscription(
      req.user.sub,
      req.user.email,
      dto,
    );
  }

  // Webhook endpoint: Midtrans tidak pakai custom header, langsung payload HTTP POST
  @ApiOperation({ summary: 'Midtrans Webhook Callback (Sistem)' })
  @HttpCode(200)
  @Post('webhook')
  async handleWebhook(@Body() payload: any) {
    return this.paymentsService.handleMidtransWebhook(payload);
  }
}
