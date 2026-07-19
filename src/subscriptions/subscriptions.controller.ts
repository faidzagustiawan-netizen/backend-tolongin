import {
  Controller,
  Post,
  Get,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { UpgradeSubscriptionDto } from './dto/upgrade-subscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Subscription Tiers Management')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @ApiOperation({
    summary:
      'Meningkatkan atau beralih paket langganan (STARTUP / KONGLOMERAT / CUSTOM)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paket langganan berhasil diperbarui.',
  })
  @Roles(Role.COMPANY, Role.ADMIN)
  @Post('upgrade')
  async upgrade(@Request() req: any, @Body() dto: UpgradeSubscriptionDto) {
    const companyId = req.user.profileId;
    return this.subscriptionsService.upgrade(companyId, dto);
  }

  @ApiOperation({
    summary: 'Mendapatkan status dan masa aktif paket langganan saat ini',
  })
  @ApiResponse({
    status: 200,
    description: 'Informasi status langganan perusahaan.',
  })
  @Roles(Role.COMPANY, Role.ADMIN)
  @Get('status')
  async getStatus(@Request() req: any) {
    const companyId = req.user.profileId;
    return this.subscriptionsService.getStatus(companyId);
  }
}
