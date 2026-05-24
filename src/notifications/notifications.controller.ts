import {
  Controller,
  Get,
  Patch,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Real-time Notifications')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiOperation({ summary: 'Mendapatkan daftar notifikasi pengguna' })
  @ApiResponse({ status: 200, description: 'Daftar notifikasi.' })
  @Get()
  async getMyNotifications(@Request() req: any) {
    return this.notificationsService.getUserNotifications(req.user.sub);
  }

  @ApiOperation({ summary: 'Menandai satu notifikasi sebagai telah dibaca' })
  @ApiResponse({ status: 200, description: 'Notifikasi ditandai dibaca.' })
  @Patch(':id/read')
  async markAsRead(@Request() req: any, @Param('id') id: string) {
    return this.notificationsService.markAsRead(req.user.sub, id);
  }

  @ApiOperation({
    summary: 'Menandai seluruh notifikasi yang belum dibaca menjadi terbaca',
  })
  @ApiResponse({
    status: 200,
    description: 'Seluruh notifikasi ditandai dibaca.',
  })
  @Patch('read-all')
  async markAllAsRead(@Request() req: any) {
    return this.notificationsService.markAllAsRead(req.user.sub);
  }
}
