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
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Payment Gateway (Midtrans)')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TALENT)
  @ApiOperation({ summary: 'Top-up token untuk Talent' })
  @Post('topup')
  async createTopup(@Request() req: any, @Body('tokenAmount') tokenAmount: number) {
    return this.paymentsService.createTokenTopup(req.user.sub, req.user.email, tokenAmount);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.COMPANY)
  @ApiOperation({ summary: 'Berlangganan paket Premium untuk Company' })
  @Post('subscribe')
  async createSubscription(@Request() req: any) {
    return this.paymentsService.createSubscription(req.user.sub, req.user.email);
  }

  // Webhook endpoint: Midtrans tidak pakai custom header, langsung payload HTTP POST
  @ApiOperation({ summary: 'Midtrans Webhook Callback (Sistem)' })
  @HttpCode(200)
  @Post('webhook')
  async handleWebhook(@Body() payload: any) {
    return this.paymentsService.handleMidtransWebhook(payload);
  }
}
