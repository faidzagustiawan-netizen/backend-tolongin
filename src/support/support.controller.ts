import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SupportService } from './support.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTicketDto, CreateTicketReplyDto } from './dto/support.dto';

@ApiTags('Support')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @ApiOperation({ summary: 'Membuat tiket bantuan' })
  @ApiResponse({
    status: 201,
    description: 'Tiket dibuat dan masuk antrean admin.',
  })
  @Post('tickets')
  async createTicket(@Request() req: any, @Body() dto: CreateTicketDto) {
    return this.supportService.createTicket(req.user.sub, dto);
  }

  @ApiOperation({ summary: 'Daftar tiket milik sendiri' })
  @Get('tickets')
  async listMyTickets(@Request() req: any) {
    return this.supportService.listMyTickets(req.user.sub);
  }

  @ApiOperation({ summary: 'Satu tiket beserta seluruh balasannya' })
  @ApiResponse({ status: 403, description: 'Tiket milik pengguna lain.' })
  @Get('tickets/:id')
  async getMyTicket(@Request() req: any, @Param('id') id: string) {
    return this.supportService.getMyTicket(req.user.sub, id);
  }

  @ApiOperation({ summary: 'Membalas tiket sendiri' })
  @Post('tickets/:id/replies')
  async replyToMyTicket(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreateTicketReplyDto,
  ) {
    return this.supportService.replyToMyTicket(req.user.sub, id, dto.message);
  }
}
